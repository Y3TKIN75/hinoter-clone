import { useMemo, useState } from 'react';
import type { Segment } from '@shared/types';
import { hms } from '../lib/format';

interface Props {
  segments: Segment[];
  currentTime: number;
  onSeek: (sec: number) => void;
  canSeek: boolean;
}

export default function TranscriptView({ segments, currentTime, onSeek, canSeek }: Props) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return needle ? segments.filter((s) => s.text.toLocaleLowerCase('tr-TR').includes(needle)) : segments;
  }, [segments, q]);

  if (!segments.length) return <p className="text-sm text-slate-400">Transkript yok.</p>;

  return (
    <div>
      <input className="input mb-4" placeholder="Transkriptte ara…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="space-y-1">
        {filtered.map((s) => {
          const active = currentTime >= s.start && currentTime < Math.max(s.end, s.start + 0.5);
          return (
            <button
              key={s.id}
              type="button"
              disabled={!canSeek}
              onClick={() => onSeek(s.start)}
              className={`flex w-full gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition ${active ? 'bg-indigo-50' : 'hover:bg-slate-50'} ${canSeek ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className="w-14 shrink-0 pt-0.5 font-mono text-xs text-slate-400">{hms(s.start)}</span>
              <span className="text-slate-800 leading-relaxed">{s.text}</span>
            </button>
          );
        })}
        {q && !filtered.length && <p className="text-sm text-slate-400">Eşleşme yok.</p>}
      </div>
    </div>
  );
}
