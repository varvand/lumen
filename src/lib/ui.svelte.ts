import { library } from './library.svelte';
import { parseImport } from './markdown';
import { storage } from './storage';
import type { Note, Prompt, Screen } from './types';

export type Modal = 'capture' | 'settings' | 'search' | 'question' | null;
export type EditorMode = 'write' | 'split' | 'read';

const inScreen = (note: Note, screen: Screen, collection = '') =>
  (screen === 'trash'
    ? note.trashed
    : !note.trashed && (screen === 'inbox' ? note.inbox : !note.inbox)) &&
  (!collection || note.collection === collection);

/**
 * Workspace state and the actions that coordinate it with the library: which screen and
 * note are open, layout toggles, dialogs, and toasts. Navigation always flushes pending
 * saves first and stays put when a save fails.
 */
class Workspace {
  screen = $state<Screen>('library');
  collection = $state('');
  activeId = $state('welcome-to-lumen');
  query = $state('');
  sort = $state<'updated' | 'title'>('updated');
  mode = $state<EditorMode>('read');
  panel = $state(true);
  focus = $state(false);
  mobileNav = $state(false);
  modal = $state<Modal>(null);
  /** The question being edited in the question dialog; undefined for a new one. */
  editingPrompt = $state<Prompt>();
  toast = $state('');

  active = $derived(library.get(this.activeId));
  visibleNotes = $derived.by(() => {
    const query = this.query.toLowerCase();
    return library.notes
      .filter((n) => inScreen(n, this.screen, this.collection))
      .filter(
        (n) => !query || `${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase().includes(query),
      )
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          (this.sort === 'title' ? a.title.localeCompare(b.title) : b.updatedAt - a.updatedAt),
      );
  });
  title = $derived(
    this.collection ||
      (this.screen === 'inbox' ? 'Inbox' : this.screen === 'trash' ? 'Trash' : 'All notes'),
  );

  /** Set by App so dialogs can open the shared Markdown file picker. */
  importPicker: HTMLInputElement | undefined;
  #toastTimer: ReturnType<typeof setTimeout> | undefined;

  notify(message: string) {
    this.toast = message;
    clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => (this.toast = ''), 3500);
  }
  /** Edit the open note. */
  change(patch: Partial<Note>) {
    if (this.active) library.change(this.active.id, patch);
  }
  open(modal: Modal) {
    this.modal = modal;
  }
  close() {
    this.modal = null;
  }
  editQuestion(prompt?: Prompt) {
    this.editingPrompt = prompt;
    this.modal = 'question';
  }

  async select(id: string) {
    try {
      await library.flush();
    } catch {
      return;
    }
    this.activeId = id;
    this.mobileNav = false;
  }
  async navigate(next: Screen, collection = '') {
    try {
      await library.flush();
    } catch {
      return;
    }
    this.screen = next;
    this.collection = collection;
    this.query = '';
    this.mobileNav = false;
    this.focus = false;
    if (next !== 'practice') {
      const candidates = library.notes.filter((n) => inScreen(n, next, collection));
      if (!candidates.some((n) => n.id === this.activeId)) this.activeId = candidates[0]?.id || '';
    }
  }
  /** Open a note from search or practice, switching to the screen that contains it. */
  async reveal(note: Note) {
    await this.navigate(note.trashed ? 'trash' : note.inbox ? 'inbox' : 'library');
    await this.select(note.id);
  }
  async createNote(data: Partial<Note> = {}) {
    const now = Date.now();
    const note: Note = {
      id: crypto.randomUUID(),
      title: 'Untitled note',
      body: '',
      collection: this.collection || 'Personal',
      tags: [],
      intent: 'reference',
      pinned: false,
      inbox: false,
      trashed: false,
      createdAt: now,
      updatedAt: now,
      revision: 0,
      prompts: [],
      source: '',
      ...data,
    };
    try {
      const saved = await library.create(note);
      this.screen = saved.inbox ? 'inbox' : 'library';
      this.collection = '';
      this.query = '';
      this.activeId = saved.id;
      this.mode = saved.body ? 'read' : 'write';
      this.mobileNav = false;
      return saved;
    } catch (e) {
      library.error = `Could not create note: ${String(e)}`;
    }
  }
  async importFiles(files: File[]) {
    for (const file of files) {
      if (file.size > 2_000_000) {
        library.error = `${file.name} is too large. The current limit is 2 MB per note.`;
        continue;
      }
      const parsed = parseImport(await file.text(), file.name);
      const imported = await this.createNote({ ...parsed, inbox: true, collection: 'Imported' });
      if (!imported) break;
    }
    this.close();
    if (files.length) this.notify('Markdown imported to your inbox');
  }
  /** Save pending edits, then run a follow-up only if saving succeeded. */
  async afterSave(then: () => unknown) {
    try {
      await library.flush();
    } catch {
      return false;
    }
    await then();
    return true;
  }
  async keepInLibrary() {
    this.change({ inbox: false });
    await this.afterSave(async () => {
      await this.navigate('library');
      this.notify('Added to your library');
    });
  }
  async toggleTrash() {
    const note = this.active;
    if (!note) return;
    const wasTrashed = note.trashed;
    this.change({ trashed: !wasTrashed });
    await this.afterSave(async () => {
      await this.navigate(wasTrashed ? 'library' : this.screen, this.collection);
      this.notify(wasTrashed ? 'Note restored' : 'Moved to Trash. You can restore it anytime.');
    });
  }
  async exportActive() {
    if (!this.active) return;
    try {
      if (await storage.export(this.active)) this.notify('Markdown exported');
    } catch (e) {
      library.error = `Export failed: ${String(e)}`;
    }
  }
  /** Recovery for a conflicting save: keep the draft as a file, then open the saved version. */
  async exportDraftAndReload() {
    const note = this.active;
    if (!note) return;
    library.cancelAutosave(note.id);
    try {
      await library.settled();
      if (!(await storage.export(note))) return;
      await library.discardDraft(note.id);
      this.notify('Draft exported. The saved version is now open.');
    } catch (e) {
      library.error = `Recovery failed: ${String(e)}`;
    }
  }
  async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.notify('Copied to clipboard');
    } catch {
      library.error = 'Clipboard access was unavailable. Select and copy the text manually.';
    }
  }
  dispose() {
    clearTimeout(this.#toastTimer);
  }
}

export const ui = new Workspace();
