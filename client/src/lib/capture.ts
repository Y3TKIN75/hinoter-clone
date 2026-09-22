// Tarayıcıda ses yakalama: mikrofon (+ isteğe bağlı sekme/sistem sesi) → Web Audio ile tek akışa karıştırma.

export interface CaptureResult {
  /** Karıştırılmış, yalnızca ses içeren akış (MediaRecorder'a verilir). */
  mixed: MediaStream;
  analyser: AnalyserNode;
  ctx: AudioContext;
  /** Sekme/sistem sesi gerçekten alındı mı? */
  tabAudioActive: boolean;
  warnings: string[];
  /** Kullanıcı tarayıcının "Paylaşımı durdur" düğmesine basarsa çağrılır. */
  onDisplayEnded: (cb: () => void) => void;
  stopAll: () => void;
}

/** Sekme/sistem sesi yakalama yalnızca Chromium masaüstünde çalışır (Firefox/Safari audio:true'yu sessizce yok sayar). */
export function tabAudioSupported() {
  const ua = navigator.userAgent;
  const isChromium = !!(navigator as unknown as { userAgentData?: unknown }).userAgentData || /Chrome\/|Chromium\/|Edg\//.test(ua);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  return isChromium && !isMobile && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}

export function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  const mime = candidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('Bu tarayıcı ses kaydını (MediaRecorder) desteklemiyor.');
  const ext = mime.startsWith('audio/webm') ? 'webm' : mime.startsWith('audio/mp4') ? 'm4a' : 'ogg';
  return { mime, ext };
}

/** Kullanıcı tıklamasından çağrılmalıdır (getDisplayMedia için zorunlu). */
export async function startCapture(opts: { tabAudio: boolean }): Promise<CaptureResult> {
  const warnings: string[] = [];
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Bu tarayıcı mikrofon erişimini desteklemiyor (HTTPS veya localhost gerekir).');

  let mic: MediaStream;
  try {
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === 'NotAllowedError') throw new Error('Mikrofon izni reddedildi. Tarayıcı adres çubuğundan izin verin.');
    if (name === 'NotFoundError') throw new Error('Mikrofon bulunamadı.');
    throw new Error(`Mikrofon açılamadı: ${(e as Error).message}`);
  }

  let display: MediaStream | null = null;
  if (opts.tabAudio) {
    if (!tabAudioSupported()) {
      warnings.push('Sekme sesi bu tarayıcıda desteklenmiyor; yalnızca mikrofon kaydediliyor.');
    } else {
      try {
        display = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 1 }, // video:true zorunlu; track'i kullanmıyoruz
          audio: true,
          // Chromium ipuçları (standart dışı)
          ...({ selfBrowserSurface: 'exclude', systemAudio: 'include', surfaceSwitching: 'include', preferCurrentTab: false } as object),
        });
        if (display.getAudioTracks().length === 0) {
          display.getTracks().forEach((t) => t.stop());
          display = null;
          warnings.push('Paylaşım penceresinde "Sekme sesini de paylaş" kutusu işaretlenmedi; yalnızca mikrofon kaydediliyor.');
        }
      } catch (e) {
        const name = (e as DOMException).name;
        warnings.push(name === 'NotAllowedError'
          ? 'Sekme paylaşımı iptal edildi; yalnızca mikrofon kaydediliyor.'
          : `Sekme sesi alınamadı (${(e as Error).message}); yalnızca mikrofon kaydediliyor.`);
        display = null;
      }
    }
  }

  const ctx = new AudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  const dest = ctx.createMediaStreamDestination();

  const micGain = ctx.createGain();
  micGain.gain.value = 1.0;
  ctx.createMediaStreamSource(mic).connect(micGain).connect(dest);

  const endedCallbacks: Array<() => void> = [];
  if (display) {
    const tabGain = ctx.createGain();
    tabGain.gain.value = 0.9;
    // ASLA ctx.destination'a bağlama → hoparlörden yankı olur.
    ctx.createMediaStreamSource(display).connect(tabGain).connect(dest);
    display.getVideoTracks()[0]?.addEventListener('ended', () => endedCallbacks.forEach((cb) => cb()));
    display.getAudioTracks()[0]?.addEventListener('ended', () => endedCallbacks.forEach((cb) => cb()));
  }

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(dest.stream).connect(analyser);

  const mixed = new MediaStream(dest.stream.getAudioTracks());

  return {
    mixed,
    analyser,
    ctx,
    tabAudioActive: !!display,
    warnings,
    onDisplayEnded: (cb) => endedCallbacks.push(cb),
    stopAll: () => {
      mic.getTracks().forEach((t) => t.stop());
      display?.getTracks().forEach((t) => t.stop());
      dest.stream.getTracks().forEach((t) => t.stop());
      void ctx.close().catch(() => undefined);
    },
  };
}
