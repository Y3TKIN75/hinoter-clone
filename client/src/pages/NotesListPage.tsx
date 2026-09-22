import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { NoteListItem } from '@shared/types';
import StatusBadge from '../components/StatusBadge';
import { formatDateTime, hms } from '../lib/format';

const SOURCE_LABEL = { mic: 'Mikrofon', tab_mic: 'Mikrofon + sekme', upload: 'Dosya' } as const;

export default function NotesListPage() {
  const [notes, setNotes] = useState<NoteListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const notesRef = useRef<NoteListItem[] | null>(null);
  notesRef.current = notes;

  async function load() {
    try {
      setNotes(await api.listNotes());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // İşlenmekte olan not varsa listeyi tazele.
    const t = setInterval(() => {
      if (notesRef.current?.some((n) => n.status === 'transcribing' || n.status === 'summarizing')) void load();
    }, 5000);
    return () => clearInterval(t);
  }, []);

  async function remove(n: NoteListItem) {
    if (!confirm(`"${n.title}" notu ve ses kaydı silinsin mi?`)) return;
    try {
      await api.deleteNote(n.id);
      setNotes((cur) => cur?.filter((x) => x.id !== n.id) ?? null);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const filtered = (notes ?? []).filter((n) => {
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return !needle || n.title.toLocaleLowerCase('tr-TR').includes(needle) || (n.tldr ?? '').toLocaleLowerCase('tr-TR').includes(needle);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Notlarım</h1>
          <p className="text-sm text-slate-500">Toplantılarınızı kaydedin; transkript, özet ve aksiyonlar otomatik çıkarılsın.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/upload" className="btn-secondary">Dosya Yükle</Link>
          <Link to="/record" className="btn-primary">
            <span className="h-2 w-2 rounded-full bg-red-400" /> Yeni Kayıt
          </Link>
        </div>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {notes && notes.length > 0 && (
        <input className="input" placeholder="Başlık veya özette ara…" value={q} onChange={(e) => setQ(e.target.value)} />
      )}

      {notes === null && !error && <p className="text-sm text-slate-400">Yükleniyor…</p>}

      {notes && notes.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-lg font-medium text-slate-900">Henüz not yok</p>
          <p className="mt-1 text-sm text-slate-500">İlk toplantınızı kaydedin ya da bir ses dosyası yükleyin.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link to="/upload" className="btn-secondary">Dosya Yükle</Link>
            <Link to="/record" className="btn-primary">Yeni Kayıt</Link>
          </div>
        </div>
      )}

      <ul className="space-y-3">
        {filtered.map((n) => (
          <li key={n.id} className="card p-4 transition hover:border-indigo-300">
            <div className="flex items-start justify-between gap-4">
              <Link to={`/notes/${n.id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-semibold text-slate-900">{n.title}</h2>
                  <StatusBadge status={n.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDateTime(n.createdAt)} · {SOURCE_LABEL[n.source]}{n.durationMs ? ` · ${hms(n.durationMs / 1000)}` : ''}
                  {n.actionItemCount ? ` · ${n.openActionItemCount}/${n.actionItemCount} açık aksiyon` : ''}
                </p>
                {n.tldr && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{n.tldr}</p>}
              </Link>
              <button type="button" onClick={() => remove(n)} className="btn-ghost text-xs" title="Sil">Sil</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
