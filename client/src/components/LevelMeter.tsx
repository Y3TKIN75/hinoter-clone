/** RMS (0–1) → dB tabanlı yatay seviye çubuğu. */
export default function LevelMeter({ level, active }: { level: number; active: boolean }) {
  const db = level > 0 ? 20 * Math.log10(level) : -100;
  const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100)); // -60 dB → %0, 0 dB → %100
  const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ${active ? color : 'bg-slate-300'}`}
          style={{ width: `${active ? pct : 0}%` }}
        />
      </div>
      <span className="w-14 text-right text-xs tabular-nums text-slate-500">{active && level > 0 ? `${db.toFixed(0)} dB` : '—'}</span>
    </div>
  );
}
