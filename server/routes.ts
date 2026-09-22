// REST API rotaları.
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import * as db from './db.js';
import { HAS_API_KEY, STT_MODEL, CHAT_MODEL, LLM_INPUT_BUDGET, modelsVerified, modelWarnings, errorMessage, errorStatus } from './groq.js';
import { transcribeBuffer, buildWhisperPrompt } from './transcribe.js';
import { runSummaryJob, progress as summaryProgress } from './summarize.js';
import { EXPORTERS, type ExportFormat } from './export.js';
import type { HealthResponse, TranscribeResponse } from '../shared/types.js';

export const router = Router();

const GROQ_FILE_LIMIT = 25 * 1024 * 1024; // Free tier dosya sınırı
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: GROQ_FILE_LIMIT + 1024 } });
const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => cb(null, db.noteAudioDir(String(req.params.id))),
    filename: (_req, file, cb) => cb(null, `full${extOf(file.originalname, file.mimetype)}`),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 },
});

function extOf(name: string, mime: string) {
  const e = path.extname(name || '').toLowerCase();
  if (/^\.[a-z0-9]{1,5}$/.test(e)) return e; // yalnızca güvenli uzantılar dosya adına girer
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('mp4') || mime.includes('m4a')) return '.m4a';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3';
  return '.bin';
}

const LangZ = z.enum(['tr', 'en', 'auto']);
const participantsZ = z.array(z.string().trim().min(1)).max(50);

function bad(res: Response, msg: string, status = 400) {
  return res.status(status).json({ error: msg });
}

function requireApiKey(_req: Request, res: Response, next: NextFunction) {
  if (!HAS_API_KEY) return bad(res, 'GROQ_API_KEY tanımlı değil. .env dosyasına anahtarınızı ekleyip sunucuyu yeniden başlatın.', 503);
  next();
}

// ---------- sağlık ----------

router.get('/health', (_req, res) => {
  const body: HealthResponse = {
    ok: true, hasApiKey: HAS_API_KEY, sttModel: STT_MODEL, chatModel: CHAT_MODEL, llmInputBudget: LLM_INPUT_BUDGET,
    modelsVerified, modelWarnings,
  };
  res.json(body);
});

// ---------- notlar ----------

router.get('/notes', (_req, res) => {
  res.json(db.listNotes());
});

const CreateNoteZ = z.object({
  title: z.string().trim().max(200).default(''),
  participants: participantsZ.default([]),
  lang: LangZ.default('tr'),
  source: z.enum(['mic', 'tab_mic', 'upload']),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.post('/notes', (req, res) => {
  const parsed = CreateNoteZ.safeParse(req.body);
  if (!parsed.success) return bad(res, 'Geçersiz istek: ' + parsed.error.message);
  const b = parsed.data;
  const title = b.title || (b.source === 'upload' ? 'Yüklenen kayıt' : `Yeni kayıt ${new Date().toLocaleString('tr-TR')}`);
  res.status(201).json(db.createNote({ ...b, title }));
});

router.get('/notes/:id', (req, res) => {
  const note = db.getNote(String(req.params.id));
  if (!note) return bad(res, 'Not bulunamadı', 404);
  res.json({ ...note, progress: summaryProgress.get(note.id) ?? null });
});

const PatchNoteZ = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  participants: participantsZ.optional(),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lang: LangZ.optional(),
  durationMs: z.number().int().nonnegative().optional(),
});

router.patch('/notes/:id', (req, res) => {
  const parsed = PatchNoteZ.safeParse(req.body);
  if (!parsed.success) return bad(res, 'Geçersiz istek: ' + parsed.error.message);
  const note = db.updateNote(String(req.params.id), parsed.data);
  if (!note) return bad(res, 'Not bulunamadı', 404);
  res.json(note);
});

router.delete('/notes/:id', (req, res) => {
  if (!db.deleteNote(String(req.params.id))) return bad(res, 'Not bulunamadı', 404);
  res.status(204).end();
});

// ---------- ses dosyası ----------

router.post('/notes/:id/audio', (req, res, next) => {
  if (!db.getNoteBase(String(req.params.id))) return bad(res, 'Not bulunamadı', 404);
  next();
}, diskUpload.single('file'), (req, res) => {
  const id = String(req.params.id);
  const file = req.file;
  if (!file) return bad(res, 'Dosya eksik');
  const durationMs = Number(req.body?.durationMs) || undefined;
  const note = db.updateNote(id, { audioPath: file.path, audioMime: file.mimetype || 'application/octet-stream', durationMs });
  res.json(note);
});

router.get('/notes/:id/audio', (req, res) => {
  const base = db.getNoteBase(String(req.params.id));
  if (!base?.audioPath || !fs.existsSync(base.audioPath)) return bad(res, 'Ses dosyası yok', 404);
  res.type(base.audioMime || 'application/octet-stream');
  res.sendFile(base.audioPath, { acceptRanges: true, cacheControl: false });
});

// ---------- transkripsiyon ----------

/**
 * Tek bir ses parçasını yazıya döker. multipart alanları:
 * file, noteId, idx, startMs, prevTail, lang
 */
router.post('/transcribe', requireApiKey, memUpload.single('file'), async (req, res) => {
  const noteId = String(req.body?.noteId ?? '');
  const idx = Number(req.body?.idx);
  const startMs = Number(req.body?.startMs);
  const prevTail = String(req.body?.prevTail ?? '');
  const langParsed = LangZ.safeParse(req.body?.lang);
  const file = req.file;
  if (!file) return bad(res, 'Ses dosyası eksik');
  if (!noteId || !Number.isInteger(idx) || !Number.isFinite(startMs)) return bad(res, 'noteId, idx ve startMs zorunlu');
  if (file.size > GROQ_FILE_LIMIT) return bad(res, 'Parça 25 MB sınırını aşıyor', 413);

  const note = db.getNoteBase(noteId);
  if (!note) return bad(res, 'Not bulunamadı', 404);
  const lang = langParsed.success ? langParsed.data : note.lang;

  const dir = db.noteAudioDir(noteId);
  const filename = `chunk-${String(idx).padStart(4, '0')}${extOf(file.originalname, file.mimetype)}`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, file.buffer);
  db.upsertChunk({ noteId, idx, startMs, filePath, silent: false, status: 'pending', rawJson: null });

  try {
    const { segments, raw } = await transcribeBuffer({
      buffer: file.buffer,
      filename,
      lang,
      prompt: buildWhisperPrompt({ title: note.title, participants: note.participants, prevTail }),
      offsetSec: startMs / 1000,
    });
    const saved = db.replaceChunkSegments(noteId, idx, segments);
    db.upsertChunk({ noteId, idx, startMs, filePath, silent: false, status: 'done', rawJson: JSON.stringify(raw).slice(0, 200_000) });
    const text = saved.map((s) => s.text).join(' ');
    const body: TranscribeResponse = { idx, segments: saved, tail: text.slice(-450) };
    res.json(body);
  } catch (e) {
    db.upsertChunk({ noteId, idx, startMs, filePath, silent: false, status: 'failed', rawJson: null });
    console.error(`[transcribe] ${noteId}#${idx}:`, e);
    res.status(errorStatus(e)).json({ error: errorMessage(e) });
  }
});

/**
 * ≤25 MB tam dosya yükleme: dosyayı tek istekte Groq'a gönderir ve oynatma için saklar.
 */
router.post('/notes/:id/upload', requireApiKey, memUpload.single('file'), async (req, res) => {
  const id = String(req.params.id);
  const note = db.getNoteBase(id);
  if (!note) return bad(res, 'Not bulunamadı', 404);
  const file = req.file;
  if (!file) return bad(res, 'Dosya eksik');
  if (file.size > GROQ_FILE_LIMIT) return bad(res, 'Dosya 25 MB sınırını aşıyor; istemci parçalama yolunu kullanın', 413);

  const filename = `full${extOf(file.originalname, file.mimetype)}`;
  const filePath = path.join(db.noteAudioDir(id), filename);
  fs.writeFileSync(filePath, file.buffer);
  db.updateNote(id, { audioPath: filePath, audioMime: file.mimetype || 'application/octet-stream', status: 'transcribing', error: null });

  try {
    const { segments, raw } = await transcribeBuffer({
      buffer: file.buffer, filename, lang: note.lang,
      prompt: buildWhisperPrompt({ title: note.title, participants: note.participants, prevTail: '' }),
      offsetSec: 0,
    });
    db.upsertChunk({ noteId: id, idx: 0, startMs: 0, filePath, silent: false, status: 'done', rawJson: JSON.stringify(raw).slice(0, 200_000) });
    const saved = db.replaceChunkSegments(id, 0, segments);
    const durationMs = raw.duration ? Math.round(raw.duration * 1000) : (saved.at(-1) ? Math.round(saved.at(-1)!.end * 1000) : 0);
    db.updateNote(id, { durationMs });
    void runSummaryJob(id);
    res.json(db.getNote(id));
  } catch (e) {
    console.error(`[upload] ${id}:`, e);
    db.updateNote(id, { status: 'error', error: errorMessage(e) });
    res.status(errorStatus(e)).json({ error: errorMessage(e) });
  }
});

// ---------- özet ----------

router.post('/notes/:id/summarize', requireApiKey, (req, res) => {
  const id = String(req.params.id);
  const note = db.getNoteBase(id);
  if (!note) return bad(res, 'Not bulunamadı', 404);
  const durationMs = Number(req.body?.durationMs);
  if (Number.isFinite(durationMs) && durationMs > 0) db.updateNote(id, { durationMs: Math.round(durationMs) });
  void runSummaryJob(id);
  res.status(202).json(db.getNote(id));
});

// ---------- aksiyon maddeleri ----------

const ActionItemZ = z.object({
  task: z.string().trim().min(1).max(500),
  owner: z.string().trim().max(100).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
});

router.post('/notes/:id/action-items', (req, res) => {
  const id = String(req.params.id);
  if (!db.getNoteBase(id)) return bad(res, 'Not bulunamadı', 404);
  const parsed = ActionItemZ.safeParse(req.body);
  if (!parsed.success) return bad(res, 'Geçersiz istek: ' + parsed.error.message);
  res.status(201).json(db.addActionItem(id, parsed.data));
});

router.patch('/action-items/:id', (req, res) => {
  const parsed = ActionItemZ.partial().extend({ done: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return bad(res, 'Geçersiz istek: ' + parsed.error.message);
  const item = db.updateActionItem(String(req.params.id), parsed.data);
  if (!item) return bad(res, 'Aksiyon bulunamadı', 404);
  res.json(item);
});

router.delete('/action-items/:id', (req, res) => {
  if (!db.deleteActionItem(String(req.params.id))) return bad(res, 'Aksiyon bulunamadı', 404);
  res.status(204).end();
});

// ---------- dışa aktarma ----------

router.get('/notes/:id/export', (req, res) => {
  const note = db.getNote(String(req.params.id));
  if (!note) return bad(res, 'Not bulunamadı', 404);
  const format = String(req.query.format ?? 'md');
  if (!Object.hasOwn(EXPORTERS, format)) return bad(res, 'format md | txt | srt | json olmalı');
  const exp = EXPORTERS[format as ExportFormat];
  const safeTitle = note.title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim().slice(0, 60) || 'not';
  res.setHeader('Content-Type', exp.mime);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${safeTitle}.${exp.ext}`)}`);
  res.send(exp.fn(note));
});
