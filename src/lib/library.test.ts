import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from './types';

const storage = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  attempt: vi.fn(),
}));
vi.mock('./storage', () => ({ storage }));

const { library } = await import('./library.svelte');

function note(id: string, patch: Partial<Note> = {}): Note {
  return {
    id,
    title: id,
    body: '',
    collection: 'Notes',
    tags: [],
    intent: 'reference',
    pinned: false,
    inbox: false,
    trashed: false,
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
    prompts: [],
    source: '',
    ...patch,
  };
}
/** A save the test resolves by hand, to edit while it is in flight. */
function deferredSave() {
  let resolve!: () => void;
  storage.save.mockImplementationOnce(
    (n: Note) =>
      new Promise<Note>((done) => (resolve = () => done({ ...n, revision: n.revision + 1 }))),
  );
  return () => resolve();
}

beforeEach(async () => {
  vi.useFakeTimers();
  storage.save.mockReset();
  storage.save.mockImplementation(async (n: Note) => ({
    ...n,
    updatedAt: 100,
    revision: n.revision + 1,
  }));
  storage.load.mockReset();
  await library.settled();
  library.notes = [note('a'), note('b')];
  library.attempts = [];
  library.dirty = [];
  library.error = '';
});
afterEach(() => {
  library.dispose();
  vi.useRealTimers();
});

describe('library', () => {
  it('autosaves an edit after a pause', async () => {
    library.change('a', { body: 'hello' });
    expect(library.isDirty('a')).toBe(true);
    expect(storage.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.save.mock.calls[0][0]).toMatchObject({ id: 'a', body: 'hello' });
    expect(library.isDirty('a')).toBe(false);
    expect(library.get('a')).toMatchObject({ revision: 2, updatedAt: 100 });
  });

  it('debounces rapid edits into one save', async () => {
    library.change('a', { body: 'h' });
    await vi.advanceTimersByTimeAsync(300);
    library.change('a', { body: 'he' });
    await vi.advanceTimersByTimeAsync(300);
    library.change('a', { body: 'hey' });
    await vi.advanceTimersByTimeAsync(600);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.save.mock.calls[0][0].body).toBe('hey');
  });

  it('keeps a note dirty when it changes again during its save', async () => {
    const finish = deferredSave();
    library.change('a', { body: 'first' });
    const saving = library.persist('a');
    await vi.advanceTimersByTimeAsync(0);
    library.change('a', { body: 'second' });
    finish();
    await saving;
    expect(library.isDirty('a')).toBe(true);
    await library.flush();
    expect(storage.save).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'second' }));
    expect(library.isDirty('a')).toBe(false);
  });

  it('runs saves one at a time', async () => {
    const finish = deferredSave();
    library.change('a', { body: 'a' });
    library.change('b', { body: 'b' });
    const flushed = library.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(storage.save).toHaveBeenCalledTimes(1);
    finish();
    await flushed;
    expect(storage.save).toHaveBeenCalledTimes(2);
    expect(library.busy).toBe(false);
  });

  it('reports a failed save and keeps the edit pending', async () => {
    storage.save.mockRejectedValueOnce(new Error('disk full'));
    library.change('a', { body: 'unsaved' });
    await expect(library.flush()).rejects.toThrow('disk full');
    expect(library.error).toContain('disk full');
    expect(library.isDirty('a')).toBe(true);
    await library.flush();
    expect(library.error).toBe('');
    expect(library.isDirty('a')).toBe(false);
  });

  it('does not reload over unsaved edits', async () => {
    library.change('a', { body: 'draft' });
    await library.refresh();
    expect(storage.load).not.toHaveBeenCalled();
    expect(library.get('a')?.body).toBe('draft');
  });

  it('discards a draft by reloading the note from storage', async () => {
    storage.load.mockResolvedValue({
      notes: [note('a', { body: 'on disk' })],
      attempts: [],
      path: '',
    });
    library.change('a', { body: 'draft' });
    await library.discardDraft('a');
    expect(library.get('a')?.body).toBe('on disk');
    expect(library.isDirty('a')).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('derives collections and counts from notes that are not trashed', () => {
    library.notes = [
      note('a', { collection: 'Physics' }),
      note('b', { collection: 'Art' }),
      note('c', { collection: 'Physics' }),
      note('d', { collection: 'Hidden', trashed: true }),
      note('e', { collection: 'Later', inbox: true }),
    ];
    expect(library.collections).toEqual(['Art', 'Physics']);
    expect(library.libraryCount).toBe(3);
    expect(library.inboxCount).toBe(1);
  });

  it('saves pending edits before creating a note', async () => {
    library.change('a', { body: 'pending' });
    const created = await library.create(note('new'));
    expect(storage.save.mock.calls.map((c) => c[0].id)).toEqual(['a', 'new']);
    expect(library.notes[0]).toBe(created);
  });
});
