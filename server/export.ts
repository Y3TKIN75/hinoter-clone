// Dışa aktarma üreticileri: Markdown, TXT, SRT, JSON (Groq SRT vermez, kendimiz üretiyoruz).
import type { Note } from '../shared/types.js';
import { hms } from './summarize.js';

function srtTime(sec: number) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}

const PRIORITY_TR = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' } as const;

export function toMarkdown(note: Note) {
  const out: string[] = [`# ${note.title}`, '', `- **Tarih:** ${note.meetingDate}`];
  if (note.participants.length) out.push(`- **Katılımcılar:** ${note.participants.join(', ')}`);
  if (note.durationMs) out.push(`- **Süre:** ${hms(note.durationMs / 1000)}`);
  out.push('');
  const s = note.summary;
  if (s) {
    out.push('## Özet', '', s.tldr, '');
    const section = (title: string, items: string[]) => {
      if (!items.length) return;
      out.push(`## ${title}`, '', ...items.map((i) => `- ${i}`), '');
    };
    section('Ana Noktalar', s.key_points);
    section('Kararlar', s.decisions);
    section('Açık Sorular', s.open_questions);
    section('Riskler', s.risks);
    section('Sonraki Adımlar', s.next_steps);
  }
  if (note.actionItems.length) {
    out.push('## Aksiyonlar', '', '| Durum | Görev | Sahip | Tarih | Öncelik | Kaynak |', '|---|---|---|---|---|---|');
    for (const a of note.actionItems) {
      out.push(`| ${a.done ? '✅' : '⬜'} | ${a.task.replace(/\|/g, '\\|')} | ${a.owner ?? '—'} | ${a.dueDate ?? '—'} | ${PRIORITY_TR[a.priority]} | ${a.sourceTimestamp != null ? hms(a.sourceTimestamp) : '—'} |`);
    }
    out.push('');
  }
  if (note.segments.length) {
    out.push('## Transkript', '');
    for (const seg of note.segments) out.push(`**[${hms(seg.start)}]** ${seg.text}  `);
    out.push('');
  }
  return out.join('\n');
}

export function toTxt(note: Note) {
  return note.segments.map((s) => `[${hms(s.start)}] ${s.text}`).join('\n') + '\n';
}

export function toSrt(note: Note) {
  return note.segments.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(Math.max(s.end, s.start + 0.5))}\n${s.text}\n`).join('\n');
}

export function toJson(note: Note) {
  return JSON.stringify(note, null, 2);
}

export const EXPORTERS = {
  md: { fn: toMarkdown, mime: 'text/markdown; charset=utf-8', ext: 'md' },
  txt: { fn: toTxt, mime: 'text/plain; charset=utf-8', ext: 'txt' },
  srt: { fn: toSrt, mime: 'application/x-subrip; charset=utf-8', ext: 'srt' },
  json: { fn: toJson, mime: 'application/json; charset=utf-8', ext: 'json' },
} as const;

export type ExportFormat = keyof typeof EXPORTERS;
