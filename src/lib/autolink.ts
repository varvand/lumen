/**
 * Suggest [[links]] between related notes with the connected chat app, spending as few
 * tokens as possible: only notes without any links are described (title, tags and their
 * opening lines), every other note is listed by title alone, notes go by short numbers,
 * and the answer is bare number pairs.
 */
import type { Note } from './types';
import type { LinkGraph } from './links';

/** Unlinked notes described per request; the rest wait for the next run. */
export const BATCH = 60;
/** Linked notes offered as targets, most recently edited first. */
const TARGETS = 300;
/** Characters of opening text per described note. */
const DIGEST = 200;
/** Links a single note may gain per run. */
const PER_NOTE = 4;

/** The opening prose of a note, without code, math, headings or Markdown syntax. */
export function digest(body: string, limit = DIGEST) {
  const text = body
    .replace(/^(```|~~~)[\s\S]*?^\1[ \t]*$/gm, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/!?\[\[([^[\]|\n]+?)(?:\|([^[\]\n]*))?\]\]/g, (_, target, alias) => alias || target)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[\s|:-]*-{3,}[\s|:-]*$/gm, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`~#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return `${cut.slice(0, cut.lastIndexOf(' ') > limit * 0.6 ? cut.lastIndexOf(' ') : limit)}…`;
}

/** A title a [[link]] can name: one line, without the characters links use as syntax. */
const linkable = (title: string) => !!title.trim() && !/[[\]|#^\n]/.test(title);

export interface LinkRequest {
  /** Notes by the number the prompt uses for them, starting at 1. */
  notes: Note[];
  /** How many of `notes`, from the start, are described unlinked notes. */
  described: number;
  /** Unlinked notes left for a later run. */
  remaining: number;
  prompt: string;
}

/**
 * Build one request, or none when no unlinked note needs checking. `checked` maps note ids
 * to the edit time they were last checked at, so unchanged notes are never sent twice.
 */
export function linkRequest(
  notes: Note[],
  graph: LinkGraph,
  checked: Record<string, number>,
): LinkRequest | undefined {
  const seen = new Map<string, number>();
  for (const note of notes) {
    const key = note.title.trim().toLowerCase();
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  // Duplicate titles can't be told apart by a [[link]], so leave them out.
  const candidates = notes
    .filter((n) => linkable(n.title) && seen.get(n.title.trim().toLowerCase()) === 1)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const linked = new Set(graph.edges.flat());
  const due = candidates.filter((n) => !linked.has(n.id) && checked[n.id] !== n.updatedAt);
  if (!due.length) return;
  const batch = due.slice(0, BATCH);
  const inBatch = new Set(batch.map((n) => n.id));
  const targets = candidates.filter((n) => !inBatch.has(n.id)).slice(0, TARGETS);
  const all = [...batch, ...targets];
  const line = (note: Note, i: number) =>
    [i + 1, note.title.trim(), note.tags.map((t) => `#${t}`).join(' '), digest(note.body)].join(
      ' | ',
    );
  const prompt = [
    'Find links between related notes in a personal knowledge base. Do not use tools.',
    'NEW notes have no links yet; each is "number | title | tags | opening text".',
    'OTHER notes are "number | title".',
    'Link a NEW note to a NEW or OTHER note only when both are clearly about the same specific',
    `topic or one builds on the other. Skip loose or generic matches; at most ${PER_NOTE} links`,
    'per NEW note, and many NEW notes should get none.',
    'Answer with one link per line as two numbers, the NEW note first, like "3 17".',
    'Write nothing else. If nothing fits, answer "none".',
    '',
    'NEW',
    ...batch.map(line),
    ...(targets.length
      ? ['', 'OTHER', ...targets.map((note, i) => `${batch.length + i + 1} | ${note.title.trim()}`)]
      : []),
  ].join('\n');
  return { notes: all, described: batch.length, remaining: due.length - batch.length, prompt };
}

export interface LinkSuggestion {
  from: Note;
  to: Note;
}

/** Read "a b" pairs from an answer, keeping only valid, new, distinct links. */
export function parseLinks(answer: string, request: LinkRequest): LinkSuggestion[] {
  const pairs = new Set<string>();
  const perNote = new Map<string, number>();
  const links: LinkSuggestion[] = [];
  for (const line of answer.split('\n')) {
    // The last two numbers, so "3 17", "3 -> 17" and a numbered "1. 3 17" all read the same.
    const numbers = line.match(/\d+/g);
    if (!numbers || numbers.length < 2) continue;
    const [a, b] = numbers.slice(-2).map(Number);
    if (a < 1 || a > request.described || b < 1 || b > request.notes.length || a === b) continue;
    const from = request.notes[a - 1];
    const to = request.notes[b - 1];
    const pair = [from.id, to.id].sort().join(' ');
    if (pairs.has(pair) || (perNote.get(from.id) || 0) >= PER_NOTE) continue;
    pairs.add(pair);
    perNote.set(from.id, (perNote.get(from.id) || 0) + 1);
    links.push({ from, to });
  }
  return links;
}

/** Add links to the end of a note, on its "Related:" line when it already ends with one. */
export function withLinks(body: string, titles: string[]) {
  const links = titles.map((title) => `[[${title.trim()}]]`).join(' · ');
  const trimmed = body.trimEnd();
  const last = trimmed.slice(trimmed.lastIndexOf('\n') + 1);
  if (/^Related: /.test(last)) return `${trimmed} · ${links}\n`;
  return trimmed ? `${trimmed}\n\nRelated: ${links}\n` : `Related: ${links}\n`;
}

const KEY = 'lumen.autolink.checked';

/** Unlinked notes already checked on this device, by id, with the edit time checked. */
export const checkedNotes = {
  load(): Record<string, number> {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      return {};
    }
  },
  save(notes: Note[]) {
    const checked = this.load();
    for (const note of notes) checked[note.id] = note.updatedAt;
    try {
      localStorage.setItem(KEY, JSON.stringify(checked));
    } catch {
      /* Without storage, notes are simply checked again next time. */
    }
  },
};

/**
 * Suggestions waiting for review, as note id pairs. Kept when the panel is dismissed, so a
 * later click shows them again without asking the chat app twice.
 */
export function pendingLinks(
  pairs: [string, string][],
  get: (id: string) => Note | undefined,
  graph: LinkGraph,
): LinkSuggestion[] {
  const linked = new Set(graph.edges.flatMap(([a, b]) => [`${a} ${b}`, `${b} ${a}`]));
  const links: LinkSuggestion[] = [];
  const seen = new Set<string>();
  for (const [a, b] of pairs) {
    const from = get(a);
    const to = get(b);
    const pair = [a, b].sort().join(' ');
    if (!from || !to || from.trashed || to.trashed || !linkable(to.title)) continue;
    if (linked.has(`${a} ${b}`) || seen.has(pair)) continue;
    seen.add(pair);
    links.push({ from, to });
  }
  return links;
}

const PENDING_KEY = 'lumen.autolink.pending';

export const savedSuggestions = {
  load(): [string, string][] {
    try {
      const pairs = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
      return Array.isArray(pairs) ? pairs : [];
    } catch {
      return [];
    }
  },
  save(links: LinkSuggestion[]) {
    try {
      localStorage.setItem(
        PENDING_KEY,
        JSON.stringify(links.map(({ from, to }) => [from.id, to.id])),
      );
    } catch {
      /* Without storage, dismissed suggestions last until the app closes. */
    }
  },
};
