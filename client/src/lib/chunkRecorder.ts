// Döndürmeli parça kaydedici: ~30 sn'den sonraki ilk sessiz anda (en geç maxChunkMs'de) yeni bir MediaRecorder
// başlatıp eskisini durdurur; böylece parça sınırı kelime ortasına değil, konuşma arasına düşer.
// Böylece her parça kendi container başlığına sahip, tek başına çözülebilir bir dosya olur
// (MediaRecorder.start(timeslice) ile üretilen ara blob'lar başlıksız olduğu için Whisper'a gönderilemez).
// Paralel bir "arşiv" kaydedici oynatma için tam dosyayı tutar.
import fixWebmDuration from 'fix-webm-duration';

export interface Chunk {
  idx: number;
  startMs: number;
  durationMs: number;
  blob: Blob;
  /** Parça boyunca ölçülen en yüksek RMS (0–1). */
  maxRms: number;
}

export interface ChunkRecorderOptions {
  /** Bu süreden sonra ilk sessiz örnekte döndür (varsayılan 30 sn). */
  chunkMs?: number;
  /** Sessizlik gelmese de bu sürede mutlaka döndür (varsayılan 40 sn). */
  maxChunkMs?: number;
  /** Bu RMS'in altı "sessiz" sayılır (≈ -40 dBFS). */
  quietRms?: number;
  mime: string;
  ext: string;
  onChunk: (chunk: Chunk) => void;
  onLevel?: (rms: number) => void;
}

export class ChunkRecorder {
  private current: MediaRecorder | null = null;
  private archive: MediaRecorder | null = null;
  private parts: Blob[] = [];
  private idx = 0;
  private t0 = 0;
  private chunkStartedAt = 0;
  private levelTimer: number | null = null;
  private chunkMaxRms = 0;
  private buf: Float32Array<ArrayBuffer>;
  private stopped = false;
  readonly chunkMs: number;
  readonly maxChunkMs: number;
  readonly quietRms: number;

  constructor(
    private stream: MediaStream,
    private analyser: AnalyserNode,
    private opts: ChunkRecorderOptions,
  ) {
    this.chunkMs = opts.chunkMs ?? 30_000;
    this.maxChunkMs = Math.max(this.chunkMs, opts.maxChunkMs ?? 40_000);
    this.quietRms = opts.quietRms ?? 0.01;
    this.buf = new Float32Array(analyser.fftSize);
  }

  get elapsedMs() {
    return this.t0 ? performance.now() - this.t0 : 0;
  }

  start() {
    this.t0 = performance.now();
    this.stopped = false;
    this.current = this.makeRecorder();
    this.current.start();
    this.chunkStartedAt = performance.now();

    this.archive = new MediaRecorder(this.stream, { mimeType: this.opts.mime });
    this.archive.ondataavailable = (e) => { if (e.data.size) this.parts.push(e.data); };
    this.archive.start(1000);

    this.levelTimer = window.setInterval(() => this.sampleLevel(), 100);
  }

  private sampleLevel() {
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    if (rms > this.chunkMaxRms) this.chunkMaxRms = rms;
    this.opts.onLevel?.(rms);
    // Sessizliğe duyarlı döndürme: 30 sn dolduysa ve şu an sessizse (ya da 40 sn dolduysa) parçayı kapat.
    const age = performance.now() - this.chunkStartedAt;
    if (age >= this.chunkMs && (rms < this.quietRms || age >= this.maxChunkMs)) this.rotate();
  }

  private makeRecorder() {
    const rec = new MediaRecorder(this.stream, { mimeType: this.opts.mime, audioBitsPerSecond: 32_000 }); // ≈0,24 MB/dk
    const startMs = Math.round(this.elapsedMs);
    const myIdx = this.idx++;
    const startedAt = performance.now();
    rec.ondataavailable = (e) => {
      const maxRms = this.chunkMaxRms;
      this.chunkMaxRms = 0;
      if (e.data.size === 0) return; // iOS Safari boş blob gönderebilir
      this.opts.onChunk({ idx: myIdx, startMs, durationMs: Math.round(performance.now() - startedAt), blob: e.data, maxRms });
    };
    return rec;
  }

  private rotate() {
    if (this.stopped) return;
    const next = this.makeRecorder();
    next.start();
    this.chunkStartedAt = performance.now();
    const prev = this.current;
    this.current = next;
    if (prev && prev.state !== 'inactive') prev.stop();
  }

  /** Kaydı durdurur; son parça onChunk ile teslim edildikten sonra arşiv blob'unu döndürür. */
  async stop(): Promise<{ blob: Blob; durationMs: number; ext: string }> {
    this.stopped = true;
    if (this.levelTimer) window.clearInterval(this.levelTimer);
    const durationMs = Math.round(this.elapsedMs);

    const waitStop = (rec: MediaRecorder | null) => new Promise<void>((resolve) => {
      if (!rec || rec.state === 'inactive') return resolve();
      rec.addEventListener('stop', () => resolve(), { once: true });
      rec.stop();
    });
    await waitStop(this.current);
    await waitStop(this.archive);

    let blob = new Blob(this.parts, { type: this.opts.mime });
    if (this.opts.mime.startsWith('audio/webm')) {
      // MediaRecorder WebM'inde süre başlığı yoktur → oynatıcıda atlama yapılamaz; başlığı yaz.
      try { blob = await fixWebmDuration(blob, durationMs, { logger: false }); } catch { /* düzeltilemezse ham blob */ }
    }
    return { blob, durationMs, ext: this.opts.ext };
  }
}
