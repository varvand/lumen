import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Attempt, Library, Note } from './types';
import { seedNotes } from './seeds';
export const native = isTauri();
const KEY = 'lumen.library.v1';
function readBrowser(): Library {
  const stored = localStorage.getItem(KEY);
  if (stored) {
    const data = JSON.parse(stored);
    if (!Array.isArray(data.notes) || !Array.isArray(data.attempts))
      throw new Error(
        'The stored library could not be read. Export your browser data before resetting it.',
      );
    return data;
  }
  const library = {
    notes: seedNotes(),
    attempts: [],
    path: 'This browser · export notes to keep a backup',
  };
  localStorage.setItem(KEY, JSON.stringify(library));
  return library;
}
export const storage = {
  async load(): Promise<Library> {
    if (native) return invoke('load_library', { seeds: seedNotes() });
    return readBrowser();
  },
  async save(note: Note): Promise<Note> {
    if (native) return invoke('save_note', { note });
    const library = readBrowser();
    const old = library.notes.find((n) => n.id === note.id);
    if (old && old.revision !== note.revision)
      throw new Error(
        'This note changed in another window. Reload before saving to avoid overwriting it.',
      );
    const saved = { ...note, updatedAt: Date.now(), revision: (old?.revision || 0) + 1 };
    library.notes = [saved, ...library.notes.filter((n) => n.id !== note.id)];
    localStorage.setItem(KEY, JSON.stringify(library));
    return saved;
  },
  async attempt(attempt: Attempt): Promise<void> {
    if (native) return invoke('record_attempt', { attempt });
    const library = readBrowser();
    if (!library.attempts.some((a) => a.id === attempt.id)) library.attempts.push(attempt);
    localStorage.setItem(KEY, JSON.stringify(library));
  },
  async export(note: Note) {
    const markdown = `# ${note.title}\n\n${note.body}\n`;
    const filename = `${
      note.title
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase() || 'untitled'
    }.md`;
    if (native) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        defaultPath: filename,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (!path) return false;
      await invoke('export_markdown', { path, markdown });
    } else {
      const url = URL.createObjectURL(
        new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return true;
  },
};
