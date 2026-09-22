// Sunucu API'si için ince istemci.
import type {
  ActionItem, CreateNoteBody, HealthResponse, Note, NoteListItem, Priority, TranscribeResponse, Lang,
} from '@shared/types';

export type NoteWithProgress = Note & { progress: string | null };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => '');
  if (!res.ok) {
    const msg = (body && typeof body === 'object' && 'error' in body) ? String((body as { error: string }).error) : `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: data === undefined ? undefined : JSON.stringify(data),
});

export const api = {
  health: () => request<HealthResponse>('/api/health'),

  listNotes: () => request<NoteListItem[]>('/api/notes'),
  createNote: (body: CreateNoteBody) => request<Note>('/api/notes', json('POST', body)),
  getNote: (id: string) => request<NoteWithProgress>(`/api/notes/${id}`),
  patchNote: (id: string, patch: Partial<{ title: string; participants: string[]; meetingDate: string; lang: Lang; durationMs: number }>) =>
    request<Note>(`/api/notes/${id}`, json('PATCH', patch)),
  deleteNote: (id: string) => request<void>(`/api/notes/${id}`, { method: 'DELETE' }),

  uploadFullAudio: (id: string, blob: Blob, filename: string, durationMs: number) => {
    const fd = new FormData();
    fd.append('durationMs', String(Math.round(durationMs)));
    fd.append('file', blob, filename);
    return request<Note>(`/api/notes/${id}/audio`, { method: 'POST', body: fd });
  },

  transcribeChunk: (p: { noteId: string; idx: number; startMs: number; prevTail: string; lang: Lang; blob: Blob; filename: string }, signal?: AbortSignal) => {
    const fd = new FormData();
    fd.append('noteId', p.noteId);
    fd.append('idx', String(p.idx));
    fd.append('startMs', String(Math.round(p.startMs)));
    fd.append('prevTail', p.prevTail);
    fd.append('lang', p.lang);
    fd.append('file', p.blob, p.filename);
    return request<TranscribeResponse>('/api/transcribe', { method: 'POST', body: fd, signal });
  },

  uploadWholeFile: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return request<Note>(`/api/notes/${id}/upload`, { method: 'POST', body: fd });
  },

  summarize: (id: string, durationMs?: number) => request<Note>(`/api/notes/${id}/summarize`, json('POST', { durationMs })),

  addActionItem: (noteId: string, body: { task: string; owner?: string | null; dueDate?: string | null; priority?: Priority }) =>
    request<ActionItem>(`/api/notes/${noteId}/action-items`, json('POST', body)),
  patchActionItem: (id: string, patch: Partial<Pick<ActionItem, 'task' | 'owner' | 'dueDate' | 'priority' | 'done'>>) =>
    request<ActionItem>(`/api/action-items/${id}`, json('PATCH', patch)),
  deleteActionItem: (id: string) => request<void>(`/api/action-items/${id}`, { method: 'DELETE' }),

  exportUrl: (id: string, format: 'md' | 'txt' | 'srt' | 'json') => `/api/notes/${id}/export?format=${format}`,
  audioUrl: (id: string) => `/api/notes/${id}/audio`,
};
