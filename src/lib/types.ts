export type Intent = 'reference' | 'remember' | 'apply';
export type PromptKind = 'recall' | 'explain' | 'apply';
export interface Prompt {
  id: string;
  kind: PromptKind;
  question: string;
  answer: string;
}
export interface Note {
  id: string;
  title: string;
  body: string;
  collection: string;
  tags: string[];
  intent: Intent;
  pinned: boolean;
  inbox: boolean;
  trashed: boolean;
  createdAt: number;
  updatedAt: number;
  revision: number;
  prompts: Prompt[];
  source: string;
}
export interface Attempt {
  id: string;
  noteId: string;
  promptId: string;
  kind: PromptKind;
  response: string;
  rating: 'again' | 'effort' | 'got-it';
  reviewedAt: number;
  dueAt: number;
  intervalDays: number;
}
export interface Library {
  notes: Note[];
  attempts: Attempt[];
  path: string;
}
export type Screen = 'home' | 'library' | 'inbox' | 'practice' | 'graph' | 'trash';
/** A PDF in the library's attachments folder, named the way notes link to it. */
export interface Attachment {
  name: string;
  size: number;
  addedAt: number;
}
/** Text of each page of a PDF, read for a file of this size. */
export interface PdfText {
  name: string;
  size: number;
  pages: string[];
}
