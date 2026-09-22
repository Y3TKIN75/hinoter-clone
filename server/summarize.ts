// Transkript → yapılandırılmış özet + aksiyon maddeleri (Groq LLM, strict JSON şema, map-reduce).
import { groq, CHAT_MODEL, LLM_INPUT_BUDGET, errorMessage } from './groq.js';
import { MEETING_NOTES_JSON_SCHEMA, MeetingNotesZod, type MeetingNotes } from './schema.js';
import { SYSTEM_PROMPT, REDUCE_SYSTEM_PROMPT, userPrompt, reducePrompt } from './prompts.js';
import * as db from './db.js';
import type { Segment } from '../shared/types.js';

/** Türkçe metin için kaba token tahmini (o200k tokenizer'da ~2.5–3 karakter/token). */
export function estimateTokens(text: string) {
  return Math.ceil(text.length * 0.4);
}

export function hms(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function stripFences(s: string) {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

/** Ardışık satırları ~budget tokenlık pencerelere böler; %10 örtüşme ile. */
export function windows(lines: string[], budget: number, overlap = 0.1): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let curTokens = 0;
  for (const line of lines) {
    const t = estimateTokens(line) + 1;
    if (curTokens + t > budget && cur.length) {
      out.push(cur);
      const keep = Math.max(0, Math.floor(cur.length * overlap));
      cur = keep ? cur.slice(-keep) : [];
      curTokens = cur.reduce((a, l) => a + estimateTokens(l) + 1, 0);
    }
    cur.push(line);
    curTokens += t;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function callLLM(system: string, user: string): Promise<MeetingNotes> {
  let lastErr: unknown = null;
  // 1. deneme: strict json_schema; 2. deneme: json_object (bazı modeller şemayı yok sayabiliyor).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await groq.chat.completions.create({
        model: CHAT_MODEL,
        temperature: 0.2,
        reasoning_effort: 'low',
        max_completion_tokens: 3000, // Free tier 8K TPM: girdi bütçesi + çıktı sınırı toplamı 8K altında kalmalı
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: attempt === 0
          ? { type: 'json_schema', json_schema: { name: 'meeting_notes', strict: true, schema: MEETING_NOTES_JSON_SCHEMA as unknown as Record<string, unknown> } }
          : { type: 'json_object' },
      });
      const content = r.choices[0]?.message?.content ?? '';
      const parsed = MeetingNotesZod.safeParse(JSON.parse(stripFences(content)));
      if (parsed.success) return parsed.data;
      lastErr = new Error(`LLM çıktısı şemaya uymadı: ${parsed.error.message.slice(0, 300)}`);
    } catch (e) {
      lastErr = e;
      // Model json_schema desteklemiyorsa (400) ikinci denemede json_object'e düşer; 401/429 gibi hatalarda tekrar deneme anlamsız.
      const status = (e as { status?: number }).status;
      if (status === 413) throw new Error(`${errorMessage(e)} — .env içindeki LLM_INPUT_BUDGET değerini düşürüp tekrar deneyin.`);
      if (status === 401 || status === 429) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export interface SummarizeInput {
  meetingDate: string;
  participants: string[];
  segments: Segment[];
  onProgress?: (msg: string) => void;
}

/** Tek çağrı ya da map-reduce ile özet üretir. */
export async function summarizeTranscript(input: SummarizeInput): Promise<MeetingNotes> {
  const lines = input.segments.map((s) => `[${hms(s.start)}] ${s.text}`);
  const full = lines.join('\n');
  const base = { meetingDate: input.meetingDate, participants: input.participants };

  if (estimateTokens(full) <= LLM_INPUT_BUDGET) {
    input.onProgress?.('Özet üretiliyor (tek çağrı)…');
    return callLLM(SYSTEM_PROMPT, userPrompt({ ...base, transcript: full }));
  }

  // MAP: her pencere için kısmi not; bir önceki pencerenin tldr'ı bağlam olarak taşınır.
  const wins = windows(lines, LLM_INPUT_BUDGET);
  const partials: MeetingNotes[] = [];
  let running = '';
  for (let i = 0; i < wins.length; i++) {
    input.onProgress?.(`Özet üretiliyor: bölüm ${i + 1}/${wins.length}…`);
    const p = await callLLM(SYSTEM_PROMPT, userPrompt({
      ...base,
      transcript: wins[i].join('\n'),
      context: running ? `Önceki bölümlerin özeti (bağlam için, tekrar etme): ${running}` : undefined,
    }));
    partials.push(p);
    running = p.tldr;
  }

  // REDUCE: kısmi notları birleştir; çok fazlaysa hiyerarşik olarak grupla.
  let level = partials;
  while (level.length > 1) {
    const groups: MeetingNotes[][] = [];
    let cur: MeetingNotes[] = [];
    for (const p of level) {
      const size = estimateTokens(JSON.stringify([...cur, p]));
      if (size > LLM_INPUT_BUDGET && cur.length) { groups.push(cur); cur = []; }
      cur.push(p);
    }
    if (cur.length) groups.push(cur);
    if (groups.length === level.length && level.length > 1) {
      // Hiçbir grup birden fazla kısmi not alamıyorsa (bütçe çok küçük) ikişerli zorla.
      groups.length = 0;
      for (let i = 0; i < level.length; i += 2) groups.push(level.slice(i, i + 2));
    }
    const next: MeetingNotes[] = [];
    for (let i = 0; i < groups.length; i++) {
      input.onProgress?.(`Bölümler birleştiriliyor: ${i + 1}/${groups.length}…`);
      next.push(groups[i].length === 1 ? groups[i][0] : await callLLM(REDUCE_SYSTEM_PROMPT, reducePrompt({ ...base, partials: groups[i] })));
    }
    level = next;
  }
  return level[0];
}

/** Sunucunun ürettiği yer tutucu başlıklar (AI başlığıyla değiştirilebilir, Whisper sözlüğüne girmez). */
export function isDefaultTitle(title: string) {
  return !title || /^(Yeni kayıt|Yüklenen kayıt|Adsız|Untitled)/i.test(title.trim());
}

// ---------- arka plan işi ----------

const running = new Map<string, Promise<void>>();
export const progress = new Map<string, string>();

/** Sunucu yeniden başladığında yarım kalmış işleri toparlar. */
export function recoverStuckJobs() {
  for (const id of db.listNotesByStatus('summarizing')) {
    console.log(`[summarize] yarım kalan özet yeniden başlatılıyor: ${id}`);
    void runSummaryJob(id);
  }
  for (const id of db.listNotesByStatus('transcribing')) {
    // Tam dosya yükleme sunucu kapanınca yarım kaldı; kullanıcı yeniden yükleyebilir.
    db.updateNote(id, { status: 'error', error: 'Sunucu yeniden başlatıldığı için yazıya dökme yarım kaldı. Dosyayı yeniden yükleyin.' });
  }
}

/** Notu özetleyip veritabanına yazar; aynı not için eşzamanlı ikinci çalıştırmayı engeller. */
export function runSummaryJob(noteId: string): Promise<void> {
  const existing = running.get(noteId);
  if (existing) return existing;
  const job = (async () => {
    const note = db.getNote(noteId);
    if (!note) return;
    if (!note.segments.length) {
      db.updateNote(noteId, { status: 'error', error: 'Transkript boş — ses algılanmadı ya da tüm parçalar sessizdi.' });
      return;
    }
    db.updateNote(noteId, { status: 'summarizing', error: null });
    try {
      const notes = await summarizeTranscript({
        meetingDate: note.meetingDate,
        participants: note.participants,
        segments: note.segments,
        onProgress: (m) => progress.set(noteId, m),
      });
      const { action_items, ...summary } = notes;
      db.saveSummary(noteId, CHAT_MODEL, summary);
      db.replaceActionItems(noteId, action_items.map((a) => ({
        task: a.task, owner: a.owner, dueDate: a.due_date, priority: a.priority,
        sourceTimestamp: a.source_timestamp, sourceQuote: a.source_quote,
      })));
      const patch: Parameters<typeof db.updateNote>[1] = { status: 'ready', error: null };
      if (summary.title && isDefaultTitle(note.title)) patch.title = summary.title;
      db.updateNote(noteId, patch);
    } catch (e) {
      console.error(`[summarize] ${noteId}:`, e);
      db.updateNote(noteId, { status: 'error', error: `Özet üretilemedi: ${errorMessage(e)}` });
    } finally {
      progress.delete(noteId);
      running.delete(noteId);
    }
  })();
  running.set(noteId, job);
  return job;
}
