// Groq Structured Outputs için strict JSON Schema + doğrulama için Zod şeması.
import { z } from 'zod';

// Strict mod kuralları: her alan `required` içinde, additionalProperties:false, opsiyoneller ["tip","null"].
export const MEETING_NOTES_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'tldr', 'key_points', 'decisions', 'action_items', 'open_questions', 'risks', 'next_steps'],
  properties: {
    title: { type: 'string' },
    tldr: { type: 'string' },
    key_points: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'array', items: { type: 'string' } },
    action_items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['task', 'owner', 'due_date', 'priority', 'source_timestamp', 'source_quote'],
        properties: {
          task: { type: 'string' },
          owner: { type: ['string', 'null'] },
          due_date: { type: ['string', 'null'] },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          source_timestamp: { type: ['number', 'null'] },
          source_quote: { type: ['string', 'null'] },
        },
      },
    },
    open_questions: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    next_steps: { type: 'array', items: { type: 'string' } },
  },
} as const;

const nullableStr = z.union([z.string(), z.null()]).transform((v) => (v && v.trim() ? v.trim() : null));

export const ActionItemZod = z.object({
  task: z.string().trim().min(1),
  owner: nullableStr.catch(null),
  due_date: nullableStr.transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)).catch(null),
  priority: z.enum(['high', 'medium', 'low']).catch('medium'),
  source_timestamp: z.union([z.number(), z.null()]).catch(null),
  source_quote: nullableStr.catch(null),
});

const strList = z.array(z.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean));

export const MeetingNotesZod = z.object({
  title: z.string().catch(''),
  tldr: z.string().catch(''),
  key_points: strList,
  decisions: strList,
  // Tek bir bozuk madde tüm listeyi düşürmesin: geçersizleri ayıkla.
  action_items: z.array(z.unknown()).catch([]).transform((arr) =>
    arr.map((x) => ActionItemZod.safeParse(x)).filter((r) => r.success).map((r) => r.data),
  ),
  open_questions: strList,
  risks: strList,
  next_steps: strList,
});

export type MeetingNotes = z.infer<typeof MeetingNotesZod>;
