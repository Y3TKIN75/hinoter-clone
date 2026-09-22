// Groq Whisper ile parça (chunk) transkripsiyonu: prompt zinciri, halüsinasyon filtresi, zaman ofsetleme.
import { toFile } from 'groq-sdk';
import { groq, STT_MODEL } from './groq.js';
import type { Lang } from '../shared/types.js';
import { isDefaultTitle } from './summarize.js';

/** Whisper'ın sessizlikte ürettiği tipik halüsinasyonlar (TR + EN). */
const HALLUCINATIONS = [
  /altyaz[ıi]\s*m\.?\s*k\.?/i,
  /izledi[ğg]iniz i[çc]in te[şs]ekk[üu]r/i,
  /abone olmay[ıi] unutmay[ıi]n/i,
  /kanal[ıi]m[ıi]za? abone/i,
  /be[ğg]enmeyi unutmay[ıi]n/i,
  /thank(s| you) for watching/i,
  /subtitles? by/i,
  /subscribe to (my|the|our) channel/i,
  /^\s*(müzik|music)\s*$/i,
  /^[\s.\-_*♪]*$/,
];

export interface RawSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  avg_logprob?: number;
  compression_ratio?: number;
  no_speech_prob?: number;
}

export interface VerboseTranscription {
  text: string;
  language?: string;
  duration?: number;
  segments?: RawSegment[];
}

/** Whisper prompt'u en fazla 224 token dikkate alır; ~650 karakter güvenli üst sınır. */
const PROMPT_MAX_CHARS = 650;

export function buildWhisperPrompt(opts: { title: string; participants: string[]; prevTail: string }) {
  const glossary = [!isDefaultTitle(opts.title) ? `Toplantı: ${opts.title}.` : '', opts.participants.length ? `Katılımcılar: ${opts.participants.join(', ')}.` : '']
    .filter(Boolean).join(' ');
  return `${glossary} ${opts.prevTail}`.trim().slice(-PROMPT_MAX_CHARS);
}

export function isHallucination(text: string) {
  return HALLUCINATIONS.some((rx) => rx.test(text));
}

/**
 * Tek bir ses parçasını Groq'a gönderir ve zaman damgalarını kaydın başına göre ofsetlenmiş
 * segment listesi döndürür.
 */
export async function transcribeBuffer(opts: {
  buffer: Buffer;
  filename: string;
  lang: Lang;
  prompt?: string;
  offsetSec: number;
}) {
  const res = (await groq.audio.transcriptions.create({
    file: await toFile(opts.buffer, opts.filename),
    model: STT_MODEL,
    language: opts.lang === 'auto' ? undefined : opts.lang,
    prompt: opts.prompt || undefined,
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
    temperature: 0,
  })) as unknown as VerboseTranscription;

  const raw = res.segments ?? [];
  const segments = raw
    .filter((s) => !(typeof s.no_speech_prob === 'number' && s.no_speech_prob > 0.6 && (s.avg_logprob ?? 0) < -0.7))
    .filter((s) => !(typeof s.compression_ratio === 'number' && s.compression_ratio > 2.6))
    // Parça sonunda 0,2–0,5 sn'ye sıkışmış 4+ kelimelik "segment"ler Whisper kuyruk halüsinasyonudur.
    .filter((s) => !(s.end - s.start < 0.5 && s.text.trim().split(/\s+/).length > 3))
    .map((s) => ({ start: opts.offsetSec + s.start, end: opts.offsetSec + s.end, text: s.text.trim() }))
    .filter((s) => s.text && !isHallucination(s.text));

  // Segment gelmediyse (bazı yanıtlar yalnızca text döndürebilir) düz metni tek segment yap.
  if (!segments.length && res.text?.trim() && !raw.length && !isHallucination(res.text)) {
    segments.push({ start: opts.offsetSec, end: opts.offsetSec + (res.duration ?? 0), text: res.text.trim() });
  }

  return { segments, raw: res };
}
