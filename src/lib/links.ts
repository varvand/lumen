/**
 * [[Wikilinks]] between notes. A link names a note by its title, the way Obsidian names a
 * note by its file name: "[[Title]]", "[[Folder/Title]]", "[[Title#Heading]]", or
 * "[[Title|shown text]]". Titles match without regard to case.
 */
import type { Note } from './types';

/** [[target]] or [[target|alias]], on one line. Embeds (![[…]]) are matched by callers. */
export const WIKILINK = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]*))?\]\]/g;

/** Apply a transform to prose only, leaving fenced and inline code untouched. */
export function outsideCode(text: string, transform: (prose: string) => string) {
  return text
    .split(/(^```[\s\S]*?^```[ \t]*$|^~~~[\s\S]*?^~~~[ \t]*$)/m)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .split(/(`+[^`\n]*?`+)/)
            .map((piece, j) => (j % 2 ? piece : transform(piece)))
            .join(''),
    )
    .join('');
}

/** The title a link points at: no heading or block part, no folders, no ".md". */
export function linkKey(target: string) {
  return target.split('#')[0].split('/').pop()!.replace(/\.md$/i, '').trim().toLowerCase() || '';
}

/** The text a link shows: its alias, or the target without folders. */
export function linkLabel(target: string, alias?: string) {
  return (
    alias?.trim() ||
    target.split('#')[0].split('/').pop()!.trim() ||
    target.replace(/^#\^?/, '').trim()
  );
}

const targetCache = new Map<string, { body: string; keys: string[] }>();

/** Distinct link keys in a note body, outside code. Cached per note until its body changes. */
export function linkKeys(note: Pick<Note, 'id' | 'body'>) {
  const cached = targetCache.get(note.id);
  if (cached?.body === note.body) return cached.keys;
  const keys = new Set<string>();
  outsideCode(note.body, (prose) => {
    for (const match of prose.matchAll(WIKILINK)) {
      const key = linkKey(match[1]);
      if (key) keys.add(key);
    }
    return prose;
  });
  const result = [...keys];
  targetCache.set(note.id, { body: note.body, keys: result });
  return result;
}

/** Notes by lowercased title; the first note with a title wins. */
export function titleIndex(notes: Note[]) {
  const index = new Map<string, Note>();
  for (const note of notes) {
    const key = note.title.trim().toLowerCase();
    if (key && !index.has(key)) index.set(key, note);
  }
  return index;
}

export interface LinkGraph {
  /** Resolved links as [from, to] note ids, without duplicates or self-links. */
  edges: [string, string][];
  /** Note ids that link to each note. */
  backlinks: Map<string, string[]>;
}

export function linkGraph(notes: Note[], index = titleIndex(notes)): LinkGraph {
  const edges: [string, string][] = [];
  const backlinks = new Map<string, string[]>();
  for (const note of notes) {
    for (const key of linkKeys(note)) {
      const target = index.get(key);
      if (!target || target.id === note.id) continue;
      edges.push([note.id, target.id]);
      const sources = backlinks.get(target.id);
      if (sources) sources.push(note.id);
      else backlinks.set(target.id, [note.id]);
    }
  }
  return { edges, backlinks };
}
