import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type NoteWithProgress } from '../api';
import type { ActionItem } from '@shared/types';
import StatusBadge from '../components/StatusBadge';
import AudioPlayer from '../components/AudioPlayer';
import TranscriptView from '../components/TranscriptView';
import SummaryView from '../components/SummaryView';
import ActionItemsTable from '../components/ActionItemsTable';
import ExportPanel from '../components/ExportPanel';
import { formatDate, hms } from '../lib/format';

type Tab = 'summary' | 'actions' | 'transcript' | 'export';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'summary', label: 'Özet' },
  { id: 'actions', label: 'Aksiyonlar' },
  { id: 'transcript', label: 'Transkript' },
  { id: 'export', label: 'Dışa Aktar' },
];

export default function NoteDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [note, setNote] = useState<NoteWithProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('summary');
  const [currentTime, setCurrentTime] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const load = useCallback(async () => {
    try {
      const n = await api.getNote(id);
      setNote(n);
      setError(null);
      return n;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // İşlem sürerken 3 sn'de bir tazele. ('recording' dâhil: kayıt sayfası parçaları göndermeye devam ediyor olabilir.)
  const processing = note?.status === 'transcribing' || note?.status === 'summarizing';
  const isRecording = note?.status === 'recording';
  useEffect(() => {
    if (!processing && !isRecording) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [processing, isRecording, load]);

  // Özet yokken transkript sekmesini öne al.
  useEffect(() => {
    if (note && !note.summary && note.segments.length && tab === 'summary' && note.status !== 'summarizing') setTab('transcript');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  const seek = (sec: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, sec - 0.3);
    void el.play().catch(() => undefined);
  };

  async function resummarize() {
    if (!note) return;
    setBusy(true);
    try {
      setNote(await api.summarize(note.id) as NoteWithProgress);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveMeta(patch: { title?: string; participants?: string[]; meetingDate?: string }) {
    if (!note) return;
    try {
      const updated = await api.patchNote(note.id, patch);
      setNote({ ...updated, progress: note.progress });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove() {
    if (!note || !confirm(`"${note.title}" silinsin mi?`)) return;
    await api.deleteNote(note.id);
    nav('/');
  }

  if (error && !note) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        <Link to="/" className="btn-secondary">Notlara dön</Link>
      </div>
    );
  }
  if (!note) return <p className="text-sm text-slate-400">Yükleniyor…</p>;

  const onActionsChange = (update: (items: ActionItem[]) => ActionItem[]) =>
    setNote((cur) => (cur ? { ...cur, actionItems: update(cur.actionItems) } : cur));

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editing ? (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  void saveMeta({
                    title: String(fd.get('title') ?? '').trim() || note.title,
                    participants: String(fd.get('participants') ?? '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
                    meetingDate: String(fd.get('meetingDate') ?? '') || note.meetingDate,
                  });
                  setEditing(false);
                }}
              >
                <input name="title" className="input text-lg font-semibold" defaultValue={note.title} />
                <div className="flex flex-wrap gap-2">
                  <input name="participants" className="input flex-1" placeholder="Katılımcılar (virgülle)" defaultValue={note.participants.join(', ')} />
                  <input name="meetingDate" type="date" className="input w-44" defaultValue={note.meetingDate} />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">Kaydet</button>
                  <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Vazgeç</button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-slate-900">{note.title}</h1>
                  <StatusBadge status={note.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDate(note.meetingDate)}
                  {note.durationMs ? ` · ${hms(note.durationMs / 1000)}` : ''}
                  {note.participants.length ? ` · ${note.participants.join(', ')}` : ''}
                </p>
              </>
            )}
          </div>
          {!editing && (
            <div className="flex flex-wrap gap-1">
              <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(true)}>Düzenle</button>
              <button type="button" className="btn-ghost text-xs" onClick={resummarize} disabled={busy || processing || !note.segments.length} title="Özeti ve aksiyonları yeniden üret">
                Yeniden özetle
              </button>
              <button type="button" className="btn-ghost text-xs text-rose-600" onClick={remove}>Sil</button>
            </div>
          )}
        </div>

        {processing && (
          <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800 animate-pulse">
            {note.progress ?? (note.status === 'summarizing' ? 'Özet ve aksiyonlar üretiliyor…' : 'Yazıya dökülüyor…')}
          </p>
        )}
        {isRecording && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span>Bu kayıt tamamlanmamış görünüyor (kayıt sayfası kapatılmış olabilir). Mevcut {note.segments.length} transkript parçasıyla özet üretebilirsiniz.</span>
            <button type="button" className="btn-secondary text-xs" onClick={resummarize} disabled={busy || !note.segments.length}>Şimdi özetle</button>
          </div>
        )}
        {note.status === 'error' && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <span>{note.error ?? 'Bilinmeyen hata'}</span>
            {note.segments.length > 0 && <button type="button" className="btn-secondary text-xs" onClick={resummarize} disabled={busy}>Tekrar dene</button>}
          </div>
        )}
        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {note.hasAudio && (
          <div className="mt-4">
            <AudioPlayer ref={audioRef} src={api.audioUrl(note.id)} onTimeUpdate={setCurrentTime} />
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex gap-1 border-b border-slate-200 px-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {t.label}
              {t.id === 'actions' && note.actionItems.length > 0 && (
                <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{note.actionItems.filter((a) => !a.done).length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === 'summary' && <SummaryView summary={note.summary} />}
          {tab === 'actions' && (
            <ActionItemsTable noteId={note.id} items={note.actionItems} participants={note.participants} onChange={onActionsChange} onSeek={seek} canSeek={note.hasAudio} />
          )}
          {tab === 'transcript' && <TranscriptView segments={note.segments} currentTime={currentTime} onSeek={seek} canSeek={note.hasAudio} />}
          {tab === 'export' && <ExportPanel note={note} />}
        </div>
      </div>
    </div>
  );
}
