import { useEffect, useState, type FormEvent } from 'react';
import { Link, useBlocker, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Lang, Note } from '@shared/types';
import { useRecorder } from '../hooks/useRecorder';
import { tabAudioSupported } from '../lib/capture';
import LevelMeter from '../components/LevelMeter';
import LiveTranscript from '../components/LiveTranscript';
import { hms, todayIso } from '../lib/format';

const LS_KEY = 'notasistan.recordPrefs';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as { lang?: Lang; tabAudio?: boolean; participants?: string }; } catch { return {}; }
}

export default function RecordPage() {
  const nav = useNavigate();
  const prefs = loadPrefs();
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState(prefs.participants ?? '');
  const [lang, setLang] = useState<Lang>(prefs.lang ?? 'tr');
  const [tabAudio, setTabAudio] = useState(prefs.tabAudio ?? tabAudioSupported());
  const [note, setNote] = useState<Note | null>(null);
  const [finishMsg, setFinishMsg] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRecorder();

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ lang, tabAudio, participants })); } catch { /* yoksay */ }
  }, [lang, tabAudio, participants]);

  const parseParticipants = () => participants.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

  async function begin(e: FormEvent) {
    e.preventDefault();
    if (starting) return;
    setStarting(true);
    setError(null);
    let created: Note | null = null;
    try {
      created = await api.createNote({
        title: title.trim(),
        participants: parseParticipants(),
        lang,
        source: tabAudio && tabAudioSupported() ? 'tab_mic' : 'mic',
        meetingDate: todayIso(),
      });
      setNote(created);
      await rec.start({ noteId: created.id, lang, tabAudio });
    } catch (err) {
      setError((err as Error).message);
      if (created) { await api.deleteNote(created.id).catch(() => undefined); setNote(null); }
    } finally {
      setStarting(false);
    }
  }

  async function finish() {
    if (!note) return;
    setError(null);
    try {
      setFinishMsg('Kayıt kapatılıyor…');
      const result = await rec.stop();
      setFinishMsg('Ses dosyası yükleniyor…');
      await api.uploadFullAudio(note.id, result.blob, `full.${result.ext}`, result.durationMs).catch((e) => {
        // Ses yüklenemese de transkript/özet devam edebilir.
        console.warn('Ses yüklenemedi:', e);
      });
      setFinishMsg('Özet başlatılıyor…');
      await api.summarize(note.id, result.durationMs);
      nav(`/notes/${note.id}`);
    } catch (err) {
      setError((err as Error).message);
      setFinishMsg(null);
    }
  }

  async function cancel() {
    if (!confirm('Kayıt iptal edilsin mi? Şimdiye kadarki her şey silinir.')) return;
    rec.cancel();
    if (note) await api.deleteNote(note.id).catch(() => undefined);
    nav('/');
  }

  const recording = rec.phase === 'recording' || rec.phase === 'finishing' || rec.phase === 'starting';

  // Kayıt sürerken uygulama içi bir bağlantıya tıklanırsa kaydı sessizce kaybetme.
  const blocker = useBlocker(recording);
  const cancelRec = rec.cancel;
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (confirm('Kayıt devam ediyor. Sayfadan ayrılırsanız kayıt durur ve şimdiye kadarki parçalar özetlenmeden kalır. Ayrılmak istiyor musunuz?')) {
      cancelRec();
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, cancelRec]);

  if (!recording && rec.phase !== 'done') {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Yeni Kayıt</h1>
          <p className="text-sm text-slate-500">Mikrofonunuzu (ve isterseniz toplantı sekmesinin sesini) kaydeder, konuşulanları yazıya döker.</p>
        </div>
        <form onSubmit={begin} className="card space-y-4 p-5">
          <div>
            <label className="label" htmlFor="title">Başlık</label>
            <input id="title" className="input" placeholder="ör. Sprint planlama" value={title} onChange={(e) => setTitle(e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">Boş bırakırsanız AI özetten bir başlık üretir.</p>
          </div>
          <div>
            <label className="label" htmlFor="participants">Katılımcılar</label>
            <input id="participants" className="input" placeholder="Ayşe, Mehmet, Yetkin" value={participants} onChange={(e) => setParticipants(e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">Virgülle ayırın. İsimler transkript doğruluğunu ve aksiyon sahiplerinin eşlenmesini iyileştirir.</p>
          </div>
          <div>
            <label className="label" htmlFor="lang">Konuşma dili</label>
            <select id="lang" className="input" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              <option value="tr">Türkçe</option>
              <option value="en">İngilizce</option>
              <option value="auto">Otomatik algıla (karışık TR/EN için)</option>
            </select>
          </div>
          <label className={`flex items-start gap-3 rounded-lg border p-3 ${tabAudioSupported() ? 'border-slate-200' : 'border-slate-100 bg-slate-50 opacity-70'}`}>
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={tabAudio && tabAudioSupported()} disabled={!tabAudioSupported()} onChange={(e) => setTabAudio(e.target.checked)} />
            <span className="text-sm">
              <span className="font-medium text-slate-900">Toplantı sekmesinin sesini de kaydet</span>
              <span className="block text-xs text-slate-500">
                {tabAudioSupported()
                  ? 'Kayıt başlarken Meet/Zoom/Teams sekmesini seçin ve "Sekme sesini de paylaş" kutusunu işaretleyin. Karşı tarafın sesi de yazıya dökülür.'
                  : 'Bu tarayıcı sekme sesini desteklemiyor (Chrome/Edge masaüstü gerekir). Yalnızca mikrofon kaydedilir; hoparlörden gelen ses mikrofona düşerse yine yazıya dökülür.'}
              </span>
            </span>
          </label>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={starting}>
            <span className="h-2.5 w-2.5 rounded-full bg-red-300" /> {starting ? 'Mikrofon açılıyor…' : 'Kaydı Başlat'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{note?.title ?? 'Kayıt'}</h1>
            <p className="text-xs text-slate-500">
              {rec.tabAudioActive ? 'Mikrofon + sekme sesi' : 'Yalnızca mikrofon'} · {lang === 'auto' ? 'otomatik dil' : lang.toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {rec.phase === 'recording' && <span className="flex items-center gap-2 text-sm text-red-600"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />KAYIT</span>}
            <span className="font-mono text-2xl tabular-nums text-slate-900">{hms(rec.elapsedMs / 1000)}</span>
          </div>
        </div>
        <div className="mt-4"><LevelMeter level={rec.level} active={rec.phase === 'recording'} /></div>
        {rec.warnings.length > 0 && (
          <ul className="mt-3 space-y-1">
            {rec.warnings.map((w, i) => <li key={i} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{w}</li>)}
          </ul>
        )}
        {error && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <span>{error}</span>
            {rec.phase === 'done' && note && <Link to={`/notes/${note.id}`} className="btn-secondary text-xs">Nota git ve tekrar dene</Link>}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={finish} className="btn-primary" disabled={rec.phase !== 'recording'}>Kaydı Bitir ve Özetle</button>
          <button type="button" onClick={cancel} className="btn-ghost" disabled={rec.phase === 'finishing'}>İptal</button>
          <span className="ml-auto text-xs text-slate-500">
            {rec.phase === 'starting' && 'Mikrofon açılıyor…'}
            {rec.phase === 'finishing' && (finishMsg ?? (rec.pending > 0 ? `Son ${rec.pending} parça yazıya dökülüyor…` : 'Tamamlanıyor…'))}
            {rec.phase === 'recording' && rec.pending > 0 && `${rec.pending} parça sırada`}
          </span>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Canlı transkript</h2>
        <LiveTranscript blocks={rec.blocks} />
      </div>
    </div>
  );
}
