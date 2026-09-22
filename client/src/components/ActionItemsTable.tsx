import { useState } from 'react';
import type { ActionItem, Priority } from '@shared/types';
import { api } from '../api';
import { hms } from '../lib/format';

interface Props {
  noteId: string;
  items: ActionItem[];
  participants: string[];
  onChange: (update: (items: ActionItem[]) => ActionItem[]) => void;
  onSeek: (sec: number) => void;
  canSeek: boolean;
}

const PRIORITY: Record<Priority, { label: string; cls: string }> = {
  high: { label: 'Yüksek', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  medium: { label: 'Orta', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  low: { label: 'Düşük', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

export default function ActionItemsTable({ noteId, items, participants, onChange, onSeek, canSeek }: Props) {
  const [newTask, setNewTask] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const owners = Array.from(new Set([...participants, ...items.map((i) => i.owner).filter((o): o is string => !!o)]));

  async function patch(id: string, p: Partial<Pick<ActionItem, 'task' | 'owner' | 'dueDate' | 'priority' | 'done'>>) {
    setBusy(id);
    setErr(null);
    try {
      const updated = await api.patchActionItem(id, p);
      onChange((cur) => cur.map((i) => (i.id === id ? updated : i)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('Bu aksiyon silinsin mi?')) return;
    setBusy(id);
    try {
      await api.deleteActionItem(id);
      onChange((cur) => cur.filter((i) => i.id !== id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    const task = newTask.trim();
    if (!task) return;
    setBusy('new');
    try {
      const created = await api.addActionItem(noteId, { task });
      onChange((cur) => [...cur, created]);
      setNewTask('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const open = items.filter((i) => !i.done).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{items.length} aksiyon · {open} açık</p>
      </div>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}

      {items.length === 0 && <p className="text-sm text-slate-400">AI henüz aksiyon çıkarmadı ya da toplantıda aksiyon yoktu. Aşağıdan elle ekleyebilirsiniz.</p>}

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {items.map((it) => (
          <li key={it.id} className={`p-3 ${it.done ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-indigo-600"
                checked={it.done}
                disabled={busy === it.id}
                onChange={(e) => patch(it.id, { done: e.target.checked })}
                title="Yapıldı"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  key={it.task}
                  className={`w-full bg-transparent text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded px-1 -mx-1 ${it.done ? 'line-through' : ''}`}
                  defaultValue={it.task}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.task) patch(it.id, { task: v }); }}
                />
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="flex items-center gap-1 text-slate-500">
                    Sahip
                    <input
                      key={it.owner ?? ''}
                      list={`owners-${noteId}`}
                      className="w-32 rounded border border-slate-200 px-1.5 py-0.5 text-slate-800"
                      defaultValue={it.owner ?? ''}
                      placeholder="—"
                      onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== it.owner) patch(it.id, { owner: v }); }}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-slate-500">
                    Tarih
                    <input
                      type="date"
                      className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-800"
                      value={it.dueDate ?? ''}
                      onChange={(e) => patch(it.id, { dueDate: e.target.value || null })}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-slate-500">
                    Öncelik
                    <select
                      className={`rounded px-1.5 py-0.5 ring-1 ring-inset ${PRIORITY[it.priority].cls}`}
                      value={it.priority}
                      onChange={(e) => patch(it.id, { priority: e.target.value as Priority })}
                    >
                      {(Object.keys(PRIORITY) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
                    </select>
                  </label>
                  {it.sourceTimestamp != null && (
                    <button
                      type="button"
                      disabled={!canSeek}
                      onClick={() => onSeek(it.sourceTimestamp!)}
                      className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-default disabled:hover:bg-slate-100"
                      title={it.sourceQuote ?? 'Kaynağa git'}
                    >
                      ▶ {hms(it.sourceTimestamp)}
                    </button>
                  )}
                  <button type="button" onClick={() => remove(it.id)} className="ml-auto text-slate-400 hover:text-rose-600" title="Sil">Sil</button>
                </div>
                {it.sourceQuote && <p className="text-xs italic text-slate-400">“{it.sourceQuote}”</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <datalist id={`owners-${noteId}`}>
        {owners.map((o) => <option key={o} value={o} />)}
      </datalist>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <input className="input" placeholder="Yeni aksiyon ekle…" value={newTask} onChange={(e) => setNewTask(e.target.value)} />
        <button type="submit" className="btn-secondary shrink-0" disabled={!newTask.trim() || busy === 'new'}>Ekle</button>
      </form>
    </div>
  );
}
