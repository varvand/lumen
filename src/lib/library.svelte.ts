import { storage } from './storage';
import { collectionTree } from './collections';
import { latestAttempts, practiceQueue } from './learning';
import type { Attempt, Note } from './types';

const AUTOSAVE_MS = 600;

/**
 * Library data and persistence: the notes, review history, and the autosave queue.
 * Saves run one at a time; a per-note generation counter keeps a note marked dirty when
 * it was edited again while its previous save was in flight.
 */
class LibraryStore {
  notes = $state<Note[]>([]);
  attempts = $state<Attempt[]>([]);
  path = $state('');
  loading = $state(true);
  saving = $state(false);
  error = $state('');
  dirty = $state<string[]>([]);

  live = $derived(this.notes.filter((n) => !n.trashed));
  libraryCount = $derived(this.live.filter((n) => !n.inbox).length);
  inboxCount = $derived(this.live.filter((n) => n.inbox).length);
  collections = $derived(
    [
      ...new Set(
        this.live
          .filter((n) => !n.inbox)
          .map((n) => n.collection)
          .filter(Boolean),
      ),
    ].sort(),
  );
  latest = $derived(latestAttempts(this.attempts));
  folders = $derived(collectionTree(this.notes));
  due = $derived(practiceQueue(this.notes, this.latest));

  #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #generations = new Map<string, number>();
  #saveChain: Promise<void> = Promise.resolve();

  get(id: string) {
    return this.notes.find((n) => n.id === id);
  }
  isDirty(id: string) {
    return this.dirty.includes(id);
  }
  get busy() {
    return this.saving || this.dirty.length > 0;
  }

  /** Edit a note in place and schedule an autosave. In-place edits keep derived views that
   * don't read the changed fields (for example the practice queue while typing) untouched. */
  change(id: string, patch: Partial<Note>) {
    const note = this.get(id);
    if (!note) return;
    Object.assign(note, patch);
    this.#generations.set(id, (this.#generations.get(id) || 0) + 1);
    if (!this.dirty.includes(id)) this.dirty.push(id);
    clearTimeout(this.#timers.get(id));
    this.#timers.set(
      id,
      setTimeout(() => void this.persist(id).catch(() => {}), AUTOSAVE_MS),
    );
  }
  cancelAutosave(id: string) {
    clearTimeout(this.#timers.get(id));
    this.#timers.delete(id);
  }
  persist(id: string): Promise<void> {
    this.cancelAutosave(id);
    const task = this.#saveChain
      .catch(() => {})
      .then(async () => {
        const note = this.get(id);
        if (!note || !this.dirty.includes(id)) return;
        const generation = this.#generations.get(id);
        this.saving = true;
        try {
          const saved = await storage.save($state.snapshot(note));
          const current = this.get(id);
          if (current)
            Object.assign(current, { updatedAt: saved.updatedAt, revision: saved.revision });
          if (this.#generations.get(id) === generation)
            this.dirty = this.dirty.filter((x) => x !== id);
          this.error = '';
        } catch (e) {
          this.error = `Could not save: ${String(e)}`;
          throw e;
        } finally {
          this.saving = false;
        }
      });
    this.#saveChain = task;
    return task;
  }
  /** Write every pending change. Rejects when a save fails so callers can stay put. */
  async flush() {
    await this.settled();
    for (const id of [...this.dirty]) await this.persist(id);
  }
  async create(note: Note) {
    await this.flush();
    const saved = await storage.save(note);
    this.notes.unshift(saved);
    return saved;
  }
  /** Save many new notes, adding them to the list in batches so large imports stay smooth. */
  async importNotes(notes: Note[], onProgress?: (done: number) => void) {
    await this.flush();
    const failed: { id: string; title: string; reason: string }[] = [];
    let batch: Note[] = [];
    for (const [i, note] of notes.entries()) {
      try {
        batch.push(await storage.save(note));
      } catch (e) {
        failed.push({ id: note.id, title: note.title, reason: String(e) });
      }
      if (batch.length >= 50 || i === notes.length - 1) {
        this.notes = [...batch, ...this.notes];
        batch = [];
      }
      onProgress?.(i + 1);
    }
    return failed;
  }
  async refresh() {
    if (this.busy) return;
    try {
      const library = await storage.load();
      this.notes = library.notes;
      this.attempts = library.attempts;
      this.path = library.path;
    } catch (e) {
      this.error = String(e);
    }
  }
  async recordAttempt(attempt: Attempt) {
    await storage.attempt(attempt);
    this.attempts.push(attempt);
  }
  /** Wait for the save in flight, if any, without starting new ones. */
  settled() {
    return this.#saveChain.catch(() => {});
  }
  /** Drop the local draft of a note and replace it with the version on disk. */
  async discardDraft(id: string) {
    this.cancelAutosave(id);
    await this.settled();
    const library = await storage.load();
    const reloaded = library.notes.find((n) => n.id === id);
    if (!reloaded) throw new Error('The note was not found on disk. Your exported draft is safe.');
    this.notes = this.notes.map((n) => (n.id === id ? reloaded : n));
    this.dirty = this.dirty.filter((n) => n !== id);
    this.error = '';
  }
  dispose() {
    for (const timer of this.#timers.values()) clearTimeout(timer);
  }
}

export const library = new LibraryStore();
