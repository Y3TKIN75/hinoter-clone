// Büyük (>25 MB) ses/video dosyaları için tarayıcı tarafı ön işleme:
// decodeAudioData → 16 kHz mono'ya yeniden örnekleme → ≤10 dk'lık WAV parçaları (her biri ≈19 MB < 25 MB).
// Böylece sunucuda ffmpeg gerekmeden Groq'un dosya sınırına uyulur.

export const GROQ_FILE_LIMIT = 25 * 1024 * 1024;
const TARGET_RATE = 16_000;
const CHUNK_SEC = 600;

export interface WavChunk {
  idx: number;
  startMs: number;
  durationMs: number;
  blob: Blob;
  maxRms: number;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Dosyayı çözer ve 16 kHz mono WAV parçaları üretir. Çok uzun dosyalarda bellek sınırına takılabilir. */
export async function* fileToWavChunks(file: File, onProgress?: (msg: string) => void): AsyncGenerator<WavChunk> {
  onProgress?.('Dosya çözümleniyor…');
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch (e) {
    await ctx.close();
    throw new Error(`Dosya çözümlenemedi (desteklenmeyen biçim ya da çok büyük): ${(e as Error).message}`);
  } finally {
    void ctx.close().catch(() => undefined);
  }

  onProgress?.('16 kHz mono\'ya dönüştürülüyor…');
  const length = Math.ceil(decoded.duration * TARGET_RATE);
  const offline = new OfflineAudioContext(1, length, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const mono = (await offline.startRendering()).getChannelData(0);

  const samplesPerChunk = CHUNK_SEC * TARGET_RATE;
  const total = Math.ceil(mono.length / samplesPerChunk);
  for (let i = 0; i < total; i++) {
    const slice = mono.subarray(i * samplesPerChunk, Math.min(mono.length, (i + 1) * samplesPerChunk));
    let maxRms = 0;
    const win = TARGET_RATE; // 1 sn'lik pencerelerde RMS
    for (let j = 0; j < slice.length; j += win) {
      let sum = 0;
      const end = Math.min(slice.length, j + win);
      for (let k = j; k < end; k++) sum += slice[k] * slice[k];
      const rms = Math.sqrt(sum / (end - j));
      if (rms > maxRms) maxRms = rms;
    }
    onProgress?.(`Parça ${i + 1}/${total} hazırlanıyor…`);
    yield {
      idx: i,
      startMs: Math.round((i * samplesPerChunk / TARGET_RATE) * 1000),
      durationMs: Math.round((slice.length / TARGET_RATE) * 1000),
      blob: encodeWav(slice, TARGET_RATE),
      maxRms,
    };
  }
}

export async function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
    const url = URL.createObjectURL(file);
    el.preload = 'metadata';
    el.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(el.duration) ? el.duration * 1000 : null); };
    el.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    el.src = url;
  });
}
