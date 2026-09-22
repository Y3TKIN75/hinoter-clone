import type { NoteStatus } from '@shared/types';

const MAP: Record<NoteStatus, { label: string; cls: string; pulse?: boolean }> = {
  recording: { label: 'Kaydediliyor', cls: 'bg-red-50 text-red-700 ring-red-200', pulse: true },
  transcribing: { label: 'Yazıya dökülüyor', cls: 'bg-sky-50 text-sky-700 ring-sky-200', pulse: true },
  summarizing: { label: 'Özetleniyor', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200', pulse: true },
  ready: { label: 'Hazır', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  error: { label: 'Hata', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

export default function StatusBadge({ status }: { status: NoteStatus }) {
  const m = MAP[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${m.cls}`}>
      {m.pulse && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
      {m.label}
    </span>
  );
}
