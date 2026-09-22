import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Lang, Note } from '@shared/types';
import { fileToWavChunks, probeDuration, GROQ_FILE_LIMIT } from '../lib/audioFile';
import { TranscribeQueue, SILENCE_RMS } from '../lib/transcribeQueue';
import { formatBytes, todayIso } from '../lib/format';

const ACCEPT = '.mp3,.wav,.m4a,.mp4,.webm,.ogg,.flac,.mpeg,.mpga,.mov,audio/*,video/*';

export default function UploadPage() {
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState('');
  const [lang, setLang] = useState<Lang>('tr');
  const [meetingDate, setMeetingDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | null) {
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    let note: Note | null = null;
    let transcribedAny = false; // sunucuda transkript oluştuysa hata hâlinde notu silme, detay sayfasından tekrar denenebilir
    try {
      note = await api.createNote({
        title: title.trim(), participants: participants.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean), lang, source: 'upload', meetingDate,
      });

      if (file.size <= GROQ_FILE_LIMIT) {
        // Küçük dosya: sunucu tek istekte Groq'a gönderir ve özeti başlatır.
        setProgress('Dosya yükleniyor ve yazıya dökülüyor… (dosya uzunluğuna göre 10–60 sn)');
        await api.uploadWholeFile(note.id, file);
        nav(`/notes/${note.id}`);
        return;
      }

      // Büyük dosya: tarayıcıda 16 kHz mono WAV parçalarına böl, sırayla gönder.
      const noteId = note.id;
      let done = 0, failed = 0;
      const queue = new TranscribeQueue(noteId, lang, {
        onSegments: () => { done++; transcribedAny = true; },
        onSkipped: () => { done++; },
        onFailed: (idx, msg) => { failed++; console.warn(`Parça ${idx} başarısız: ${msg}`); },
        onPendingChange: (p) => setProgress((cur) => (cur?.startsWith('Parça') ? cur : `${p} parça yazıya dökülmeyi bekliyor…`)),
      });
      let total = 0;
      for await (const c of fileToWavChunks(file, (m) => setProgress(m))) {
        total++;
        queue.push({ idx: c.idx, startMs: c.startMs, blob: c.blob, filename: `chunk-${c.idx}.wav`, silent: c.maxRms < SILENCE_RMS });
      }
      setProgress(`${total} parça Groq'a gönderiliyor… (her parça ≈10 dk ses)`);
      const ticker = setInterval(() => setProgress(`Yazıya dökülüyor: ${done + failed}/${total} parça${failed ? ` (${failed} hatalı)` : ''}`), 1000);
      try { await queue.drain(); } finally { clearInterval(ticker); }
      if (failed === total) throw new Error('Hiçbir parça yazıya dökülemedi. Groq anahtarınızı ve limitlerinizi kontrol edin.');

      setProgress('Orijinal dosya kaydediliyor…');
      const durationMs = (await probeDuration(file)) ?? 0;
      await api.uploadFullAudio(noteId, file, file.name, durationMs).catch((err) => console.warn('Ses yüklenemedi:', err));
      setProgress('Özet başlatılıyor…');
      await api.summarize(noteId, durationMs || undefined);
      nav(`/notes/${noteId}`);
    } catch (err) {
      setError((err as Error).message);
      if (note && !transcribedAny) {
        await api.deleteNote(note.id).catch(() => undefined);
      } else if (note) {
        nav(`/notes/${note.id}`); // transkript duruyor; özet detay sayfasından "Şimdi özetle" ile tekrar denenebilir
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dosya Yükle</h1>
        <p className="text-sm text-slate-500">Mevcut bir ses ya da video kaydını yazıya dökün ve özetleyin.</p>
      </div>
      <form onSubmit={submit} className="card space-y-4 p-5">
        <div
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${file ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-300 hover:border-indigo-300'}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0] ?? null); }}
        >
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          {file ? (
            <>
              <p className="text-sm font-medium text-slate-900">{file.name}</p>
              <p className="text-xs text-slate-500">{formatBytes(file.size)} · {file.size > GROQ_FILE_LIMIT ? 'tarayıcıda parçalanacak (25 MB üstü)' : 'doğrudan gönderilecek'}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-900">Dosyayı buraya bırakın ya da tıklayın</p>
              <p className="text-xs text-slate-500">MP3, WAV, M4A, MP4, WEBM, OGG, FLAC, MOV</p>
            </>
          )}
        </div>
        <div>
          <label className="label" htmlFor="u-title">Başlık</label>
          <input id="u-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ör. Müşteri görüşmesi" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="u-date">Toplantı tarihi</label>
            <input id="u-date" type="date" className="input" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">"Cuma", "gelecek hafta" gibi ifadeler bu tarihe göre çözülür.</p>
          </div>
          <div>
            <label className="label" htmlFor="u-lang">Konuşma dili</label>
            <select id="u-lang" className="input" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              <option value="tr">Türkçe</option>
              <option value="en">İngilizce</option>
              <option value="auto">Otomatik algıla</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="u-participants">Katılımcılar</label>
          <input id="u-participants" className="input" value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="Ayşe, Mehmet, Yetkin" />
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {progress && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800 animate-pulse">{progress}</p>}
        <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={!file || busy}>
          {busy ? 'İşleniyor…' : 'Yükle ve Yazıya Dök'}
        </button>
      </form>
    </div>
  );
}
