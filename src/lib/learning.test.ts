import { describe, it, expect } from 'vitest';
import { schedule, practiceQueue, latestAttempts, latestAttempt } from './learning';
import { seedNotes } from './seeds';
import type { Attempt } from './types';

describe('Practice scheduling', () => {
  it('keeps reference-only, inbox, and trashed notes out of practice', () => {
    const sample = seedNotes()[1];
    for (const patch of [{ intent: 'reference' as const }, { inbox: true }, { trashed: true }])
      expect(practiceQueue([{ ...sample, ...patch }], [])).toHaveLength(0);
  });
  it('only includes application tasks when the goal is apply', () => {
    const note = { ...seedNotes()[1], intent: 'remember' as const };
    expect(practiceQueue([note], []).map((q) => q.prompt.kind)).toEqual(['recall', 'explain']);
  });
  it('uses the most recent attempt, including a reset after a lapse', () => {
    const note = seedNotes()[1];
    const attempt: Attempt = {
      id: 'attempt-1',
      noteId: note.id,
      promptId: note.prompts[0].id,
      kind: 'recall',
      response: 'answer',
      rating: 'got-it',
      reviewedAt: 100,
      ...schedule('got-it', undefined, 100),
    };
    expect(practiceQueue([note], [attempt], 100).map((q) => q.prompt.id)).not.toContain(
      note.prompts[0].id,
    );
    const lapse = {
      ...attempt,
      id: 'attempt-2',
      reviewedAt: 200,
      rating: 'again' as const,
      ...schedule('again', attempt, 200),
    };
    expect(lapse.dueAt).toBe(600200);
    expect(practiceQueue([note], [attempt, lapse], 600201).map((q) => q.prompt.id)).toContain(
      note.prompts[0].id,
    );
  });
  it('interleaves notes and does not equate successful recall with successful application', () => {
    const a = seedNotes()[1],
      b = { ...a, id: 'second-note', prompts: a.prompts.map((p) => ({ ...p, id: p.id + '-b' })) };
    expect(
      practiceQueue([a, b], [])
        .slice(0, 4)
        .map((q) => q.note.id),
    ).toEqual([a.id, b.id, a.id, b.id]);
  });
  it('indexes the latest attempt per question regardless of history order', () => {
    const base: Attempt = {
      id: 'a',
      noteId: 'n',
      promptId: 'p',
      kind: 'recall',
      response: '',
      rating: 'effort',
      reviewedAt: 300,
      dueAt: 400,
      intervalDays: 1,
    };
    const latest = latestAttempts([
      base,
      { ...base, id: 'b', reviewedAt: 100 },
      { ...base, id: 'c', promptId: 'other', reviewedAt: 500 },
    ]);
    expect(latestAttempt(latest, 'p', 'n')?.id).toBe('a');
    expect(latestAttempt(latest, 'other', 'n')?.id).toBe('c');
    expect(latestAttempt(latest, 'p', 'missing')).toBeUndefined();
  });
});
