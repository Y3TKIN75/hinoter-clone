import { useState } from 'react';
import type { Note } from '@shared/types';
import { api } from '../api';
import { hms } from '../lib/format';

const PRIORITY_TR = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' } as const;

/** Panoya kopyalanacak kısa özet metni (Slack/e-posta için). */
export function summaryToClipboardText(note: Note) {
  const s = note.summary;
  const lines: string[] = [`*${note.title}* — ${note.meetingDate}`];
  if (s?.tldr) lines.push('', s.tldr);
  const section = (title: string, items: string[]) => { if (items.length) lines.push('', `*${title}*`, ...items.map((i) => `• ${i}`)); };
  if (s) {
    section('Ana Noktalar', s.key_points);
    section('Kararlar', s.decisions);
    section('Sonraki Adımlar', s.next_steps);
    section('Açık Sorular', s.open_questions);
    section('Riskler', s.risks);
  }
  if (note.actionItems.length) {
    lines.push('', '*Aksiyonlar*');
    for (const a of note.actionItems) {
      const meta = [a.owner, a.dueDate, PRIORITY_TR[a.priority]].filter(Boolean).join(' · ');
      lines.push(`${a.done ? '☑' : '☐'} ${a.task}${meta ? ` (${meta})` : ''}${a.sourceTimestamp != null ? ` [${hms(a.sourceTimestamp)}]` : ''}`);
    }
  }
  return lines.join('\n');
}

export default function ExportPanel({ note }: { note: Note }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(summaryToClipboardText(note));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const formats = [
    { f: 'md', label: 'Markdown (.md)', desc: 'Özet + aksiyonlar + transkript; Notion/Obsidian için' },
    { f: 'txt', label: 'Düz metin (.txt)', desc: 'Zaman damgalı transkript' },
    { f: 'srt', label: 'Altyazı (.srt)', desc: 'Video oynatıcılar için' },
    { f: 'json', label: 'JSON (.json)', desc: 'Tüm veri, entegrasyonlar için' },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {formats.map(({ f, label, desc }) => (
          <a key={f} href={api.exportUrl(note.id, f)} download className="card flex items-center justify-between gap-3 p-4 hover:border-indigo-300">
            <div>
              <p className="text-sm font-medium text-slate-900">{label}</p>
              <p className="text-xs text-slate-500">{desc}</p>
            </div>
            <span className="text-slate-400">↓</span>
          </a>
        ))}
      </div>
      <div className="card p-4">
        <p className="mb-2 text-sm font-medium text-slate-900">Özeti panoya kopyala</p>
        <p className="mb-3 text-xs text-slate-500">Slack, e-posta veya Teams'e yapıştırmaya hazır biçim.</p>
        <button type="button" onClick={copy} className="btn-secondary" disabled={!note.summary && !note.actionItems.length}>
          {copied ? 'Kopyalandı ✓' : 'Kopyala'}
        </button>
      </div>
      {note.hasAudio && (
        <div className="card p-4">
          <p className="mb-2 text-sm font-medium text-slate-900">Ses kaydı</p>
          <a href={api.audioUrl(note.id)} download className="btn-secondary">Ses dosyasını indir</a>
        </div>
      )}
    </div>
  );
}
