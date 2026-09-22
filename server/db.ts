// SQLite kalıcılık katmanı — Node'un yerleşik node:sqlite modülü (native derleme gerektirmez).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ActionItem, Note, NoteListItem, NoteSource, NoteStatus, Priority, Segment, Summary, Lang,
} from '../shared/types.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(import.meta.dirname, '..', 'data'));
export const AUDIO_DIR = path.join(DATA_DIR, 'audio');
fs.mkdirSync(AUDIO_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS notes (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  meeting_date  TEXT NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'tr',
  participants  TEXT NOT NULL DEFAULT '[]',
  source        TEXT NOT NULL,
  status        TEXT NOT NULL,
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  audio_path    TEXT,
  audio_mime    TEXT,
  error         TEXT
);
CREATE TABLE IF NOT EXISTS chunks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  idx        INTEGER NOT NULL,
  start_ms   INTEGER NOT NULL,
  file_path  TEXT,
  silent     INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'pending',
  raw_json   TEXT,
  UNIQUE(note_id, idx)
);
CREATE TABLE IF NOT EXISTS segments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  chunk_idx  INTEGER NOT NULL,
  start_s    REAL NOT NULL,
  end_s      REAL NOT NULL,
  text       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS segments_note ON segments(note_id, start_s);
CREATE TABLE IF NOT EXISTS summaries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  model      TEXT NOT NULL,
  json       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS action_items (
  id               TEXT PRIMARY KEY,
  note_id          TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  task             TEXT NOT NULL,
  owner            TEXT,
  due_date         TEXT,
  priority         TEXT NOT NULL DEFAULT 'medium',
  source_timestamp REAL,
  source_quote     TEXT,
  done             INTEGER NOT NULL DEFAULT 0,
  position         INTEGER NOT NULL DEFAULT 0,
  manual           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS action_items_note ON action_items(note_id, position);
`);

// Basit şema göçü: eski veritabanlarına eksik sütunları ekle.
{
  const cols = (db.prepare('PRAGMA table_info(action_items)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!cols.includes('manual')) db.exec('ALTER TABLE action_items ADD COLUMN manual INTEGER NOT NULL DEFAULT 0');
}

// ---------- yardımcılar ----------

type Row = Record<string, unknown>;

function rowToNoteBase(r: Row) {
  return {
    id: r.id as string,
    title: r.title as string,
    createdAt: r.created_at as number,
    meetingDate: r.meeting_date as string,
    lang: r.lang as Lang,
    participants: JSON.parse((r.participants as string) || '[]') as string[],
    source: r.source as NoteSource,
    status: r.status as NoteStatus,
    durationMs: (r.duration_ms as number) ?? 0,
    hasAudio: !!r.audio_path,
    audioMime: (r.audio_mime as string | null) ?? null,
    audioPath: (r.audio_path as string | null) ?? null,
    error: (r.error as string | null) ?? null,
  };
}

function rowToSegment(r: Row): Segment {
  return {
    id: r.id as number,
    chunkIdx: r.chunk_idx as number,
    start: r.start_s as number,
    end: r.end_s as number,
    text: r.text as string,
  };
}

function rowToActionItem(r: Row): ActionItem {
  return {
    id: r.id as string,
    noteId: r.note_id as string,
    task: r.task as string,
    owner: (r.owner as string | null) ?? null,
    dueDate: (r.due_date as string | null) ?? null,
    priority: r.priority as Priority,
    sourceTimestamp: (r.source_timestamp as number | null) ?? null,
    sourceQuote: (r.source_quote as string | null) ?? null,
    done: !!r.done,
    position: r.position as number,
    manual: !!r.manual,
  };
}

// ---------- notlar ----------

export function createNote(input: {
  title: string; participants: string[]; lang: Lang; source: NoteSource; meetingDate?: string; status?: NoteStatus;
}) {
  const id = randomUUID();
  const now = Date.now();
  const meetingDate = input.meetingDate || new Date(now).toISOString().slice(0, 10);
  db.prepare(`INSERT INTO notes (id, title, created_at, meeting_date, lang, participants, source, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.title, now, meetingDate, input.lang, JSON.stringify(input.participants), input.source,
      input.status ?? (input.source === 'upload' ? 'transcribing' : 'recording'));
  return getNote(id)!;
}

export function getNoteBase(id: string) {
  const r = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToNoteBase(r) : null;
}

export function getNote(id: string): Note | null {
  const base = getNoteBase(id);
  if (!base) return null;
  const { audioPath: _audioPath, ...pub } = base;
  return {
    ...pub,
    summary: getSummary(id),
    actionItems: getActionItems(id),
    segments: getSegments(id),
  };
}

export function listNotes(): NoteListItem[] {
  const rows = db.prepare(`
    SELECT n.*,
      (SELECT COUNT(*) FROM action_items a WHERE a.note_id = n.id) AS action_count,
      (SELECT COUNT(*) FROM action_items a WHERE a.note_id = n.id AND a.done = 0) AS open_action_count,
      (SELECT json FROM summaries s WHERE s.note_id = n.id ORDER BY s.created_at DESC LIMIT 1) AS summary_json
    FROM notes n ORDER BY n.created_at DESC`).all() as Row[];
  return rows.map((r) => {
    const b = rowToNoteBase(r);
    let tldr: string | null = null;
    if (r.summary_json) {
      try { tldr = (JSON.parse(r.summary_json as string) as Summary).tldr ?? null; } catch { /* yoksay */ }
    }
    return {
      id: b.id, title: b.title, createdAt: b.createdAt, meetingDate: b.meetingDate, status: b.status,
      source: b.source, durationMs: b.durationMs,
      actionItemCount: r.action_count as number, openActionItemCount: r.open_action_count as number, tldr,
    };
  });
}

export function updateNote(id: string, patch: Partial<{
  title: string; participants: string[]; meetingDate: string; lang: Lang; status: NoteStatus;
  durationMs: number; audioPath: string | null; audioMime: string | null; error: string | null;
}>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const map: Record<string, string> = {
    title: 'title', meetingDate: 'meeting_date', lang: 'lang', status: 'status', durationMs: 'duration_ms',
    audioPath: 'audio_path', audioMime: 'audio_mime', error: 'error',
  };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (k === 'participants') { sets.push('participants = ?'); vals.push(JSON.stringify(v)); continue; }
    const col = map[k];
    if (!col) continue;
    sets.push(`${col} = ?`);
    vals.push(v);
  }
  if (!sets.length) return getNote(id);
  vals.push(id);
  db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...(vals as never[]));
  return getNote(id);
}

export function deleteNote(id: string) {
  const base = getNoteBase(id);
  if (!base) return false;
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  fs.rmSync(path.join(AUDIO_DIR, id), { recursive: true, force: true });
  return true;
}

export function noteAudioDir(id: string) {
  const dir = path.join(AUDIO_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Belirli durumdaki notların ID'leri (açılışta yarım kalan işleri toparlamak için). */
export function listNotesByStatus(status: NoteStatus): string[] {
  return (db.prepare('SELECT id FROM notes WHERE status = ?').all(status) as Row[]).map((r) => r.id as string);
}

// ---------- parçalar ve segmentler ----------

export function upsertChunk(input: {
  noteId: string; idx: number; startMs: number; filePath: string | null; silent: boolean; status: string; rawJson: string | null;
}) {
  db.prepare(`INSERT INTO chunks (note_id, idx, start_ms, file_path, silent, status, raw_json)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(note_id, idx) DO UPDATE SET
                start_ms = excluded.start_ms, file_path = excluded.file_path, silent = excluded.silent,
                status = excluded.status, raw_json = excluded.raw_json`)
    .run(input.noteId, input.idx, input.startMs, input.filePath, input.silent ? 1 : 0, input.status, input.rawJson);
}

export function replaceChunkSegments(noteId: string, chunkIdx: number, segs: Array<{ start: number; end: number; text: string }>): Segment[] {
  const insert = db.prepare('INSERT INTO segments (note_id, chunk_idx, start_s, end_s, text) VALUES (?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM segments WHERE note_id = ? AND chunk_idx = ?').run(noteId, chunkIdx);
    for (const s of segs) insert.run(noteId, chunkIdx, s.start, s.end, s.text);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return (db.prepare('SELECT * FROM segments WHERE note_id = ? AND chunk_idx = ? ORDER BY start_s').all(noteId, chunkIdx) as Row[]).map(rowToSegment);
}

export function getSegments(noteId: string): Segment[] {
  return (db.prepare('SELECT * FROM segments WHERE note_id = ? ORDER BY start_s, id').all(noteId) as Row[]).map(rowToSegment);
}

// ---------- özet ----------

export function saveSummary(noteId: string, model: string, data: Omit<Summary, 'model' | 'createdAt'>) {
  const createdAt = Date.now();
  const full: Summary = { ...data, model, createdAt };
  db.prepare('INSERT INTO summaries (note_id, model, json, created_at) VALUES (?, ?, ?, ?)')
    .run(noteId, model, JSON.stringify(full), createdAt);
  return full;
}

export function getSummary(noteId: string): Summary | null {
  const r = db.prepare('SELECT json FROM summaries WHERE note_id = ? ORDER BY created_at DESC LIMIT 1').get(noteId) as Row | undefined;
  if (!r) return null;
  try { return JSON.parse(r.json as string) as Summary; } catch { return null; }
}

// ---------- aksiyon maddeleri ----------

/** AI'nın ürettiği aksiyonları yeniler; elle eklenenleri ve aynı görev metnine sahip maddelerin "yapıldı" durumunu korur. */
export function replaceActionItems(noteId: string, items: Array<Omit<ActionItem, 'id' | 'noteId' | 'done' | 'position' | 'manual'>>) {
  const norm = (t: string) => t.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const existing = getActionItems(noteId);
  const doneByTask = new Map(existing.filter((e) => e.done).map((e) => [norm(e.task), true]));
  const insert = db.prepare(`INSERT INTO action_items (id, note_id, task, owner, due_date, priority, source_timestamp, source_quote, done, position, manual)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`);
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM action_items WHERE note_id = ? AND manual = 0').run(noteId);
    items.forEach((it, i) => insert.run(randomUUID(), noteId, it.task, it.owner, it.dueDate, it.priority, it.sourceTimestamp, it.sourceQuote,
      doneByTask.has(norm(it.task)) ? 1 : 0, i));
    // Elle eklenenleri AI maddelerinin ardına sırala.
    db.prepare('UPDATE action_items SET position = position + ? WHERE note_id = ? AND manual = 1').run(items.length, noteId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return getActionItems(noteId);
}

export function getActionItems(noteId: string): ActionItem[] {
  return (db.prepare('SELECT * FROM action_items WHERE note_id = ? ORDER BY position, rowid').all(noteId) as Row[]).map(rowToActionItem);
}

export function getActionItem(id: string): ActionItem | null {
  const r = db.prepare('SELECT * FROM action_items WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToActionItem(r) : null;
}

export function addActionItem(noteId: string, input: { task: string; owner?: string | null; dueDate?: string | null; priority?: Priority }) {
  const pos = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM action_items WHERE note_id = ?').get(noteId) as Row).p as number;
  const id = randomUUID();
  db.prepare(`INSERT INTO action_items (id, note_id, task, owner, due_date, priority, source_timestamp, source_quote, done, position, manual)
              VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, 1)`)
    .run(id, noteId, input.task, input.owner ?? null, input.dueDate ?? null, input.priority ?? 'medium', pos);
  return getActionItem(id)!;
}

export function updateActionItem(id: string, patch: Partial<Pick<ActionItem, 'task' | 'owner' | 'dueDate' | 'priority' | 'done'>>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const map: Record<string, string> = { task: 'task', owner: 'owner', dueDate: 'due_date', priority: 'priority', done: 'done' };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || !map[k]) continue;
    sets.push(`${map[k]} = ?`);
    vals.push(k === 'done' ? (v ? 1 : 0) : v);
  }
  if (!sets.length) return getActionItem(id);
  vals.push(id);
  db.prepare(`UPDATE action_items SET ${sets.join(', ')} WHERE id = ?`).run(...(vals as never[]));
  return getActionItem(id);
}

export function deleteActionItem(id: string) {
  const res = db.prepare('DELETE FROM action_items WHERE id = ?').run(id);
  return res.changes > 0;
}
