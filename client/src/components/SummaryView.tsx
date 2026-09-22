import type { Summary } from '@shared/types';

function Section({ title, items, tone }: { title: string; items: string[]; tone?: string }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className={`mb-2 text-sm font-semibold uppercase tracking-wide ${tone ?? 'text-slate-500'}`}>{title}</h3>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-800">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
            {it}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function SummaryView({ summary }: { summary: Summary | null }) {
  if (!summary) return <p className="text-sm text-slate-400">Henüz özet yok.</p>;
  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-indigo-50/60 p-4">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-indigo-700">Özet</h3>
        <p className="text-slate-800 leading-relaxed">{summary.tldr || '—'}</p>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Ana Noktalar" items={summary.key_points} />
        <Section title="Kararlar" items={summary.decisions} tone="text-emerald-700" />
        <Section title="Sonraki Adımlar" items={summary.next_steps} />
        <Section title="Açık Sorular" items={summary.open_questions} tone="text-amber-700" />
        <Section title="Riskler" items={summary.risks} tone="text-rose-700" />
      </div>
      <p className="text-xs text-slate-400">Model: {summary.model} · {new Date(summary.createdAt).toLocaleString('tr-TR')}</p>
    </div>
  );
}
