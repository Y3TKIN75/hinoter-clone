// Sıralı transkripsiyon kuyruğu: eşzamanlılık 1 (her parçanın Whisper prompt'u bir öncekinin kuyruğuna bağlı),
// başarısızlıkta üstel bekleme ile 3 deneme, sessiz parçaları Groq'a göndermeden atlama.
import { api, ApiError } from '../api';
import type { Lang, Segment } from '@shared/types';

export interface QueueItem {
  idx: number;
  startMs: number;
  blob: Blob;
  filename: string;
  silent: boolean;
}

export interface QueueEvents {
  onSegments: (idx: number, segments: Segment[]) => void;
  onSkipped: (idx: number) => void;
  onFailed: (idx: number, message: string) => void;
  onPendingChange: (pending: number) => void;
}

/** ≈ -40 dBFS altı → sessiz say (Whisper sessizlikte halüsinasyon üretir). */
export const SILENCE_RMS = 0.01;

export class TranscribeQueue {
  private items: QueueItem[] = [];
  private prevTail = '';
  private busy = false;
  private closed = false;
  private drainResolvers: Array<() => void> = [];
  private abort = new AbortController();

  constructor(private noteId: string, private lang: Lang, private events: QueueEvents) {}

  get pending() {
    return this.items.length + (this.busy ? 1 : 0);
  }

  push(item: QueueItem) {
    if (this.closed) return;
    this.items.push(item);
    this.events.onPendingChange(this.pending);
    void this.pump();
  }

  /** Kuyruk boşalana kadar bekler. */
  drain(): Promise<void> {
    if (!this.busy && !this.items.length) return Promise.resolve();
    return new Promise((resolve) => this.drainResolvers.push(resolve));
  }

  cancel() {
    this.closed = true;
    this.items = [];
    this.abort.abort();
    this.events.onPendingChange(0);
    this.drainResolvers.splice(0).forEach((r) => r());
  }

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.items.length && !this.closed) {
        const item = this.items.shift()!;
        this.events.onPendingChange(this.pending);
        await this.process(item);
      }
    } finally {
      this.busy = false;
      this.events.onPendingChange(this.pending);
      if (!this.items.length) this.drainResolvers.splice(0).forEach((r) => r());
    }
  }

  private async process(item: QueueItem) {
    if (item.silent || item.blob.size < 1024) {
      this.prevTail = ''; // halüsinasyon zincirini kes
      this.events.onSkipped(item.idx);
      return;
    }
    let lastErr = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this.closed) return;
      try {
        const r = await api.transcribeChunk({
          noteId: this.noteId, idx: item.idx, startMs: item.startMs, prevTail: this.prevTail, lang: this.lang,
          blob: item.blob, filename: item.filename,
        }, this.abort.signal);
        this.prevTail = r.tail;
        this.events.onSegments(item.idx, r.segments);
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        lastErr = (e as Error).message;
        const status = e instanceof ApiError ? e.status : 0;
        // Kalıcı hatalarda (yetki, geçersiz istek) tekrar deneme anlamsız.
        if (status === 401 || status === 400 || status === 404 || status === 503) break;
        const wait = status === 429 ? 15_000 * (attempt + 1) : 2_000 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    this.prevTail = '';
    this.events.onFailed(item.idx, lastErr || 'Bilinmeyen hata');
  }
}
