// İstemci ve sunucunun ortak kullandığı tipler.

export type NoteStatus = 'recording' | 'transcribing' | 'summarizing' | 'ready' | 'error';
export type NoteSource = 'mic' | 'tab_mic' | 'upload';
export type Priority = 'high' | 'medium' | 'low';
export type Lang = 'tr' | 'en' | 'auto';

export interface Segment {
  id: number;
  chunkIdx: number;
  /** saniye, kaydın başından itibaren */
  start: number;
  end: number;
  text: string;
}

export interface ActionItem {
  id: string;
  noteId: string;
  task: string;
  owner: string | null;
  /** ISO 8601 (YYYY-MM-DD) */
  dueDate: string | null;
  priority: Priority;
  /** saniye; transkriptte aksiyonun geçtiği yer */
  sourceTimestamp: number | null;
  sourceQuote: string | null;
  done: boolean;
  position: number;
  /** Kullanıcı elle ekledi (yeniden özetlemede korunur) */
  manual: boolean;
}

export interface Summary {
  title: string;
  tldr: string;
  key_points: string[];
  decisions: string[];
  open_questions: string[];
  risks: string[];
  next_steps: string[];
  model: string;
  createdAt: number;
}

export interface Note {
  id: string;
  title: string;
  createdAt: number;
  /** YYYY-MM-DD */
  meetingDate: string;
  lang: Lang;
  participants: string[];
  source: NoteSource;
  status: NoteStatus;
  durationMs: number;
  hasAudio: boolean;
  audioMime: string | null;
  error: string | null;
  summary: Summary | null;
  actionItems: ActionItem[];
  segments: Segment[];
}

export interface NoteListItem {
  id: string;
  title: string;
  createdAt: number;
  meetingDate: string;
  status: NoteStatus;
  source: NoteSource;
  durationMs: number;
  actionItemCount: number;
  openActionItemCount: number;
  tldr: string | null;
}

export interface TranscribeResponse {
  idx: number;
  segments: Segment[];
  /** bir sonraki parçanın Whisper prompt'u için metin kuyruğu */
  tail: string;
}

export interface HealthResponse {
  ok: boolean;
  hasApiKey: boolean;
  sttModel: string;
  chatModel: string;
  llmInputBudget: number;
  modelsVerified: boolean | null;
  modelWarnings: string[];
}

export interface CreateNoteBody {
  title: string;
  participants: string[];
  lang: Lang;
  source: NoteSource;
  meetingDate?: string;
}

export interface ApiError {
  error: string;
  code?: string;
}
