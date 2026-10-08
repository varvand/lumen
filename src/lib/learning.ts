import type { Attempt, Note, Prompt } from './types';
const DAY = 86_400_000;

// A transparent initial heuristic, not a calibrated memory or mastery model.
export function schedule(rating: Attempt['rating'], previous?: Attempt, now = Date.now()) {
  const intervalDays =
    rating === 'again'
      ? 0
      : rating === 'effort'
        ? Math.max(1, Math.round((previous?.intervalDays || 1) * 1.4))
        : Math.min(180, Math.max(3, Math.round((previous?.intervalDays || 1) * 2.5)));
  return { intervalDays, dueAt: now + (rating === 'again' ? 10 * 60_000 : intervalDays * DAY) };
}

export type LatestAttempts = Map<string, Attempt>;
const attemptKey = (noteId: string, promptId: string) => `${noteId}\u0000${promptId}`;

/** Index the most recent attempt per question in one pass over the history. */
export function latestAttempts(attempts: Attempt[]): LatestAttempts {
  const latest: LatestAttempts = new Map();
  for (const attempt of attempts) {
    const key = attemptKey(attempt.noteId, attempt.promptId);
    const current = latest.get(key);
    if (!current || attempt.reviewedAt > current.reviewedAt) latest.set(key, attempt);
  }
  return latest;
}
export function latestAttempt(latest: LatestAttempts, promptId: string, noteId: string) {
  return latest.get(attemptKey(noteId, promptId));
}

export function practiceQueue(
  notes: Note[],
  attempts: Attempt[] | LatestAttempts,
  now = Date.now(),
) {
  const latest = attempts instanceof Map ? attempts : latestAttempts(attempts);
  const groups = notes
    .filter((n) => !n.trashed && !n.inbox && n.intent !== 'reference')
    .map((note) => ({
      note,
      prompts: note.prompts
        .filter((p) => note.intent === 'apply' || p.kind !== 'apply')
        .filter((p) => {
          const last = latestAttempt(latest, p.id, note.id);
          return !last || last.dueAt <= now;
        }),
    }));
  const queue: { note: Note; prompt: Prompt }[] = [];
  for (let round = 0; groups.some((g) => g.prompts.length > round); round++) {
    for (const group of groups)
      if (group.prompts[round]) queue.push({ note: group.note, prompt: group.prompts[round] });
  }
  return queue;
}
export type PracticeItem = ReturnType<typeof practiceQueue>[number];
