import { library } from './library.svelte';
import { parseImport } from './markdown';
import { storage } from './storage';
import { inCollection } from './collections';
import { attachments } from './attachments.svelte';
import { isPdfTarget, pdfName, pdfPage } from './pdf';
import type { Note, Prompt, Screen } from './types';

export type Modal = 'capture' | 'settings' | 'search' | 'question' | 'obsidian' | null;
export type EditorMode = 'write' | 'split' | 'read';

const SIDEBAR_KEY = 'lumen.sidebarCollapsed';
const LIST_KEY = 'lumen.listCollapsed';
const PANEL_KEY = 'lumen.detailsOpen';
const DISCLOSURES_KEY = 'lumen.disclosures';
function storedFlag(key: string, fallback = false) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === 'true';
  } catch {
    return fallback;
  }
}
function storedDisclosures(): Record<string, boolean> {
  try {
    const value = JSON.parse(localStorage.getItem(DISCLOSURES_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Layout changes still work when device storage is unavailable. */
  }
}

/** Screens that fill the window instead of listing notes. */
export const isPage = (screen: Screen) =>
  screen === 'home' || screen === 'practice' || screen === 'graph';

const inScreen = (note: Note, screen: Screen, collection = '') =>
  (screen === 'trash'
    ? note.trashed
    : !note.trashed && (screen === 'inbox' ? note.inbox : !note.inbox)) &&
  (!collection || inCollection(note.collection, collection));

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
  panel = $state(storedFlag(PANEL_KEY, typeof window !== 'undefined' && window.innerWidth >= 1300));
  disclosures = $state(storedDisclosures());
  /** The left sidebar shows as an icon rail; remembered per device. */
  sidebarCollapsed = $state(storedFlag(SIDEBAR_KEY));
  /** The note list column is hidden, leaving more room for the open note. */
  listCollapsed = $state(storedFlag(LIST_KEY));
  focus = $state(false);
  mobileNav = $state(false);
  modal = $state<Modal>(null);
  /** The question being edited in the question dialog; undefined for a new one. */
  editingPrompt = $state<Prompt>();
  toast = $state('');
  /** The PDF open beside the note, and the page to show. */
  reader = $state<{ name: string; page: number } | null>(null);

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
  /** Set by the open editor: puts Markdown at the cursor as its own paragraph. */
  inserter: ((markdown: string) => void) | undefined;
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
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    remember(SIDEBAR_KEY, String(this.sidebarCollapsed));
  }
  toggleList(collapsed = !this.listCollapsed) {
    this.listCollapsed = collapsed;
    remember(LIST_KEY, String(collapsed));
  }
  togglePanel(open = !this.panel) {
    this.panel = open;
    remember(PANEL_KEY, String(open));
  }
  isExpanded(id: string, fallback = true) {
    return typeof this.disclosures[id] === 'boolean' ? this.disclosures[id] : fallback;
  }
  setExpanded(id: string, open: boolean) {
    this.disclosures = { ...this.disclosures, [id]: open };
    remember(DISCLOSURES_KEY, JSON.stringify(this.disclosures));
  }
  /** Open a list the user picked, showing the note list if it was hidden. */
  browse(next: Screen, collection = '') {
    if (!isPage(next) && this.listCollapsed) this.toggleList(false);
    return this.navigate(next, collection);
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
    if (!isPage(next)) {
      const candidates = library.notes.filter((n) => inScreen(n, next, collection));
      if (!candidates.some((n) => n.id === this.activeId)) this.activeId = candidates[0]?.id || '';
    }
  }
  /** Follow a [[link]]: open the note it names, or create that note when there is none. */
  async openLink(target: string) {
    if (isPdfTarget(target)) return this.openPdf(pdfName(target), pdfPage(target));
    const note = library.resolve(target);
    if (note) return this.show(note);
    const title = target.split('#')[0].split('/').pop()!.trim();
    if (!title) return;
    const from = this.active;
    await this.createNote({
      title,
      collection: from && !from.inbox ? from.collection : this.collection || 'Personal',
      inbox: false,
    });
  }
  /** Show a PDF from the library beside the open note, at a page. */
  async openPdf(name: string, page = 1) {
    if (!attachments.enabled) return this.notify('PDFs open in the desktop app.');
    const found = attachments.get(name);
    if (!found) return this.notify(`${name} is not in your library.`);
    if (isPage(this.screen)) {
      // Quotes from the PDF go into a note, so open one that cites it.
      const citing = library.live
        .filter((n) => !n.inbox && n.body.toLowerCase().includes(found.name.toLowerCase()))
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (citing) await this.reveal(citing);
      else await this.navigate('library');
    }
    this.reader = { name: found.name, page };
  }
  closeReader() {
    this.reader = null;
  }
  /** Add Markdown to the open note: at the cursor when editing, at the end otherwise. */
  insert(markdown: string) {
    const note = this.active;
    if (!note) return;
    if (this.inserter && this.mode !== 'read') return this.inserter(markdown);
    const body = note.body.trimEnd();
    this.change({ body: `${body}${body ? '\n\n' : ''}${markdown}\n` });
  }
  /** Copy PDFs into the library, embed them in the open note, and show the first. */
  async attachPdf() {
    try {
      const added = await attachments.pick();
      if (!added.length) return;
      this.insert(added.map((a) => `![[${a.name}]]`).join('\n\n'));
      this.reader = { name: added[0].name, page: 1 };
      this.notify(added.length === 1 ? `Added ${added[0].name}` : `Added ${added.length} PDFs`);
    } catch (e) {
      library.error = `Could not add the PDF: ${String(e)}`;
    }
  }
  /** Open a note, staying in the current list when it already shows that note. */
  async show(note: Note) {
    const listed = !isPage(this.screen) && this.visibleNotes.some((n) => n.id === note.id);
    return listed ? this.select(note.id) : this.reveal(note);
  }
  /** Open a note from search or practice, switching to the screen that contains it. */
  async reveal(note: Note) {
    await this.navigate(note.trashed ? 'trash' : note.inbox ? 'inbox' : 'library');
    await this.select(note.id);
  }
  async createNote(data: Partial<Note> = {}) {
    const selectedCollection = this.collection;
    const selectedScreen = this.screen;
    const now = Date.now();
    const note: Note = {
      id: crypto.randomUUID(),
      title: 'Untitled note',
      body: '',
      collection: this.collection || 'Personal',
      tags: [],
      intent: 'reference',
      pinned: false,
      inbox: selectedScreen === 'inbox',
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
      this.screen = saved.trashed ? 'trash' : saved.inbox ? 'inbox' : 'library';
      this.collection =
        selectedScreen === this.screen &&
        (!selectedCollection || inCollection(saved.collection, selectedCollection))
          ? selectedCollection
          : '';
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
  /** Move a note into a collection, filing it out of the inbox. */
  async moveNote(note: Note, collection: string) {
    library.change(note.id, { collection, inbox: false });
    await this.afterSave(() => {
      this.#keepSelection();
      this.notify(`Moved to ${collection}`);
    });
  }
  /** Trash or restore any note without leaving the current list. */
  async setTrashed(note: Note, trashed: boolean) {
    library.change(note.id, { trashed });
    await this.afterSave(() => {
      this.#keepSelection();
      this.notify(trashed ? 'Moved to Trash. You can restore it anytime.' : 'Note restored');
    });
  }
  /** When the open note leaves the current list, open the first note still in it. */
  #keepSelection() {
    if (isPage(this.screen)) return;
    const candidates = library.notes.filter((n) => inScreen(n, this.screen, this.collection));
    if (!candidates.some((n) => n.id === this.activeId)) this.activeId = candidates[0]?.id || '';
  }
  async exportNote(note = this.active) {
    if (!note) return;
    try {
      if (await storage.export(note)) this.notify('Markdown exported');
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
