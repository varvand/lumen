/**
 * Suggest [[links]] between related notes with the connected chat app, spending as few
 * tokens as possible: Lumen finds likely pairs itself by the distinctive words notes share,
 * and the chat app only confirms them from each note's title, tags and opening lines, with a
 * short yes or no per pair.
 */
import type { Note } from './types';
import type { LinkGraph } from './links';
import { cosine, vectors } from './similarity';

/** Pairs checked per request; the rest wait for the next run. */
export const BATCH = 40;
/** Likely partners considered per note; a pair must be among both notes' closest. */
const PER_NOTE = 3;
/** Pairs that share less than this are not worth asking about. */
export const MIN_SIMILARITY = 0.08;
/** Characters of opening text per described note. */
const DIGEST = 300;

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

export interface LinkSuggestion {
  from: Note;
  to: Note;
}

/** Which version of a pair was checked, so a pair is asked about again once either changes. */
const pairKey = ({ from, to }: LinkSuggestion) =>
  from.id < to.id ? `${from.id} ${to.id}` : `${to.id} ${from.id}`;
const pairVersion = ({ from, to }: LinkSuggestion) =>
  from.id < to.id ? `${from.updatedAt} ${to.updatedAt}` : `${to.updatedAt} ${from.updatedAt}`;

/**
 * Unlinked pairs of notes that share distinctive words, most alike first. Each note must be
 * among the other's few closest, so long notes that share some words with everything don't
 * pair with everything. The link goes on the more recently edited note.
 */
export function likelyPairs(notes: Note[], graph: LinkGraph): LinkSuggestion[] {
  const seen = new Map<string, number>();
  for (const note of notes) {
    const key = note.title.trim().toLowerCase();
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  // Duplicate titles can't be told apart by a [[link]], so leave them out.
  const candidates = notes.filter(
    (n) => linkable(n.title) && seen.get(n.title.trim().toLowerCase()) === 1,
  );
  const linked = new Set(graph.edges.flatMap(([a, b]) => [`${a} ${b}`, `${b} ${a}`]));
  const vecs = vectors(candidates);
  const closest = candidates.map(() => [] as { other: number; score: number }[]);
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      if (linked.has(`${candidates[i].id} ${candidates[j].id}`)) continue;
      const score = cosine(vecs[i], vecs[j]);
      if (score < MIN_SIMILARITY) continue;
      closest[i].push({ other: j, score });
      closest[j].push({ other: i, score });
    }
  const top = closest.map(
    (partners) =>
      new Set(
        partners
          .sort((a, b) => b.score - a.score)
          .slice(0, PER_NOTE)
          .map((p) => p.other),
      ),
  );
  const scored = new Map<string, { pair: LinkSuggestion; score: number }>();
  closest.forEach((partners, i) => {
    for (const { other, score } of partners.filter(
      (p) => top[i].has(p.other) && top[p.other].has(i),
    )) {
      const [a, b] = [candidates[i], candidates[other]];
      const pair = a.updatedAt >= b.updatedAt ? { from: a, to: b } : { from: b, to: a };
      scored.set(pairKey(pair), { pair, score });
    }
  });
  return [...scored.values()].sort((a, b) => b.score - a.score).map(({ pair }) => pair);
}

export interface LinkRequest {
  /** Pairs by the number the prompt uses for them, starting at 1. */
  pairs: LinkSuggestion[];
  /** Likely pairs left for a later run. */
  remaining: number;
  prompt: string;
}

/**
 * Build one request, or none when no likely pair needs checking. `checked` maps pairs to the
 * version they were last checked at, so a pair is sent again only after either note changes.
 */
export function linkRequest(
  notes: Note[],
  graph: LinkGraph,
  checked: Record<string, string>,
): LinkRequest | undefined {
  const due = likelyPairs(notes, graph).filter((p) => checked[pairKey(p)] !== pairVersion(p));
  if (!due.length) return;
  const pairs = due.slice(0, BATCH);
  // Titles are unique among candidates, so notes go by title: small models confuse note
  // numbers with pair labels.
  const described = [...new Set(pairs.flatMap(({ from, to }) => [from, to]))];
  const line = (note: Note) =>
    [note.title.trim(), note.tags.map((t) => `#${t}`).join(' '), digest(note.body)].join(' | ');
  const prompt = [
    'Decide which pairs of notes in a personal knowledge base should link to each other.',
    'Do not use tools. Each note is "title | tags | opening text".',
    'Say yes only when someone reading one note would want to open the other: one builds on,',
    'explains or applies the other, or both cover the same specific topic. Say no when they',
    'only share a broad field, a kind of note (two presentations, two meeting notes) or a few',
    'common words.',
    'Answer one line per pair: its label, then yes or no, like "P1 no". Write nothing else.',
    '',
    'NOTES',
    ...described.map(line),
    '',
    'PAIRS',
    ...pairs.map(({ from, to }, i) => `P${i + 1}: ${from.title.trim()} / ${to.title.trim()}`),
  ].join('\n');
  return { pairs, remaining: due.length - pairs.length, prompt };
}

/** The pairs an answer says yes to, from lines like "P2 yes", "P2: Yes" or "2 - yes". */
export function parseLinks(answer: string, request: LinkRequest): LinkSuggestion[] {
  const chosen = new Set<number>();
  for (const line of answer.split('\n')) {
    const match = line.match(/^\W*p?\s*(\d+)\b.*?\b(yes|no)\b/i);
    const n = Number(match?.[1]);
    if (match?.[2].toLowerCase() === 'yes' && n >= 1 && n <= request.pairs.length) chosen.add(n);
  }
  return [...chosen].sort((a, b) => a - b).map((n) => request.pairs[n - 1]);
}

/** Add links to the end of a note, on its "Related:" line when it already ends with one. */
export function withLinks(body: string, titles: string[]) {
  const links = titles.map((title) => `[[${title.trim()}]]`).join(' · ');
  const trimmed = body.trimEnd();
  const last = trimmed.slice(trimmed.lastIndexOf('\n') + 1);
  if (/^Related: /.test(last)) return `${trimmed} · ${links}\n`;
  return trimmed ? `${trimmed}\n\nRelated: ${links}\n` : `Related: ${links}\n`;
}

const KEY = 'lumen.autolink.checkedPairs';

/** Likely pairs already checked on this device, with the version of the pair checked. */
export const checkedPairs = {
  load(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      return {};
    }
  },
  save(pairs: LinkSuggestion[]) {
    const checked = this.load();
    for (const pair of pairs) checked[pairKey(pair)] = pairVersion(pair);
    try {
      localStorage.setItem(KEY, JSON.stringify(checked));
    } catch {
      /* Without storage, pairs are simply checked again next time. */
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
