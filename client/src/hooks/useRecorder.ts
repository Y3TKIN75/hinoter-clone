// Kayıt orkestrasyonu: yakalama → döndürmeli parça kaydı → sıralı transkripsiyon kuyruğu → canlı transkript.
import { useCallback, useEffect, useRef, useState } from 'react';
import { startCapture, pickMimeType, type CaptureResult } from '../lib/capture';
import { ChunkRecorder } from '../lib/chunkRecorder';
import { TranscribeQueue, SILENCE_RMS } from '../lib/transcribeQueue';
import type { Lang, Segment } from '@shared/types';

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'finishing' | 'done' | 'error';

export interface LiveBlock {
  idx: number;
  startMs: number;
  status: 'pending' | 'done' | 'skipped' | 'failed';
  segments: Segment[];
  error?: string;
}

export interface StopResult {
  blob: Blob;
  durationMs: number;
  ext: string;
  mime: string;
}

export function useRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [blocks, setBlocks] = useState<LiveBlock[]>([]);
  const [pending, setPending] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [tabAudioActive, setTabAudioActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureRef = useRef<CaptureResult | null>(null);
  const recorderRef = useRef<ChunkRecorder | null>(null);
  const queueRef = useRef<TranscribeQueue | null>(null);
  const mimeRef = useRef<{ mime: string; ext: string } | null>(null);
  const tickRef = useRef<number | null>(null);
  /** Her start() çağrısını numaralar; izin isteği beklenirken cancel()/unmount olursa geç gelen yakalama atılır. */
  const startSeq = useRef(0);

  const cleanup = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    captureRef.current?.stopAll();
    captureRef.current = null;
    recorderRef.current = null;
  }, []);

  const start = useCallback(async (opts: { noteId: string; lang: Lang; tabAudio: boolean }) => {
    setError(null);
    setBlocks([]);
    setWarnings([]);
    setPhase('starting');
    const seq = ++startSeq.current;
    try {
      const mt = pickMimeType();
      mimeRef.current = mt;
      const cap = await startCapture({ tabAudio: opts.tabAudio });
      if (seq !== startSeq.current) {
        // Bu arada iptal edildi ya da bileşen kaldırıldı: donanımı hemen bırak.
        cap.stopAll();
        return;
      }
      captureRef.current = cap;
      setWarnings(cap.warnings);
      setTabAudioActive(cap.tabAudioActive);
      cap.onDisplayEnded(() => {
        setTabAudioActive(false);
        setWarnings((w) => [...w, 'Sekme paylaşımı durduruldu; kayıt yalnızca mikrofonla devam ediyor.']);
      });

      const queue = new TranscribeQueue(opts.noteId, opts.lang, {
        onSegments: (idx, segments) => setBlocks((bs) => bs.map((b) => (b.idx === idx ? { ...b, status: 'done', segments } : b))),
        onSkipped: (idx) => setBlocks((bs) => bs.map((b) => (b.idx === idx ? { ...b, status: 'skipped' } : b))),
        onFailed: (idx, message) => setBlocks((bs) => bs.map((b) => (b.idx === idx ? { ...b, status: 'failed', error: message } : b))),
        onPendingChange: setPending,
      });
      queueRef.current = queue;

      const rec = new ChunkRecorder(cap.mixed, cap.analyser, {
        mime: mt.mime,
        ext: mt.ext,
        onLevel: setLevel,
        onChunk: (c) => {
          if (c.durationMs < 800) return; // anlamsız derecede kısa (ör. hemen durduruldu)
          const silent = c.maxRms < SILENCE_RMS;
          setBlocks((bs) => [...bs, { idx: c.idx, startMs: c.startMs, status: silent ? 'skipped' : 'pending', segments: [] }]);
          queue.push({ idx: c.idx, startMs: c.startMs, blob: c.blob, filename: `chunk-${c.idx}.${mt.ext}`, silent });
        },
      });
      recorderRef.current = rec;
      rec.start();
      tickRef.current = window.setInterval(() => setElapsedMs(rec.elapsedMs), 500);
      setPhase('recording');
    } catch (e) {
      cleanup();
      setError((e as Error).message);
      setPhase('error');
      throw e;
    }
  }, [cleanup]);

  /** Kaydı bitirir, kuyruğun boşalmasını bekler, tam ses dosyasını döndürür. */
  const stop = useCallback(async (): Promise<StopResult> => {
    const rec = recorderRef.current;
    const queue = queueRef.current;
    if (!rec || !queue) throw new Error('Kayıt aktif değil');
    setPhase('finishing');
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    const result = await rec.stop();
    setElapsedMs(result.durationMs);
    captureRef.current?.stopAll();
    await queue.drain();
    cleanup();
    setLevel(0);
    setPhase('done');
    return { ...result, mime: mimeRef.current?.mime ?? 'audio/webm' };
  }, [cleanup]);

  /** Kaydı iptal eder (transkripsiyon beklenmez). */
  const cancel = useCallback(() => {
    startSeq.current++;
    queueRef.current?.cancel();
    void recorderRef.current?.stop().catch(() => undefined);
    cleanup();
    setLevel(0);
    setPhase('idle');
  }, [cleanup]);

  // Sayfa kapatılırken kaydı kaybetmeye karşı uyar.
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'finishing') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  // Bileşen kaldırılırsa donanımı serbest bırak.
  useEffect(() => () => { startSeq.current++; queueRef.current?.cancel(); cleanup(); }, [cleanup]);

  return { phase, level, elapsedMs, blocks, pending, warnings, tabAudioActive, error, start, stop, cancel };
}
