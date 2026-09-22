import { useEffect, useRef } from 'react';
import type { LiveBlock } from '../hooks/useRecorder';
import { hms } from '../lib/format';

export default function LiveTranscript({ blocks }: { blocks: LiveBlock[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [blocks]);

  if (!blocks.length) {
    return <p className="text-sm text-slate-400">İlk 30 saniyelik parça dolduğunda transkript burada görünecek…</p>;
  }
  return (
    <div className="space-y-3">
      {blocks.map((b) => (
        <div key={b.idx} className="flex gap-3 text-sm">
          <span className="w-14 shrink-0 pt-0.5 font-mono text-xs text-slate-400">{hms(b.startMs / 1000)}</span>
          <div className="flex-1">
            {b.status === 'pending' && <span className="italic text-slate-400 animate-pulse">Yazıya dökülüyor…</span>}
            {b.status === 'skipped' && <span className="text-slate-300">(sessizlik)</span>}
            {b.status === 'failed' && <span className="text-rose-600">Parça yazıya dökülemedi: {b.error}</span>}
            {b.status === 'done' && (b.segments.length
              ? <p className="text-slate-800 leading-relaxed">{b.segments.map((s) => s.text).join(' ')}</p>
              : <span className="text-slate-300">(konuşma algılanmadı)</span>)}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
