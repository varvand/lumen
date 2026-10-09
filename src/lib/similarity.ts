/**
 * How alike two notes are by the distinctive words they share (TF-IDF cosine similarity), so
 * link suggestions can find likely pairs locally before asking a chat app about them.
 */
import type { Note } from './types';

/** Common English and German words that say nothing about a topic. */
const STOP_WORDS = new Set(
  (
    'the and for are with that this from into you your not but can its was were has have had ' +
    'will would should could their there them then than they what when where which while who ' +
    'why how all any each also only over such use used using more most other some very via ' +
    'per our out about after before both between during under again just like may might must ' +
    'one two three new see well get got make made note notes here these those does done ' +
    'der die das und ist mit von den dem des ein eine einer eines für auf auch sich nicht als ' +
    'bei aus wie oder wird werden sind zum zur nach über noch nur kann dass wenn'
  ).split(' '),
);
/** Title and tag words say more about a note than any one word of its body. */
const TITLE_WEIGHT = 3;

/** Topic words: lowercase, without code, LaTeX commands, stop words or a plural "s". */
export function words(text: string) {
  const prose = text
    .replace(/^(```|~~~)[\s\S]*?^\1[ \t]*$/gm, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/\]\([^)]*\)/g, ' ')
    .toLowerCase();
  return (prose.match(/\p{L}[\p{L}\p{N}]+/gu) || [])
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

function counts(note: Pick<Note, 'title' | 'body' | 'tags'>) {
  const tf = new Map<string, number>();
  for (const w of words(note.body)) tf.set(w, (tf.get(w) || 0) + 1);
  for (const w of words(`${note.title} ${note.tags.join(' ')}`))
    tf.set(w, (tf.get(w) || 0) + TITLE_WEIGHT);
  return tf;
}

/** Unit-length TF-IDF vectors, one per note. Words in only one note can't connect two. */
export function vectors(notes: Pick<Note, 'title' | 'body' | 'tags'>[]) {
  const tfs = notes.map(counts);
  const df = new Map<string, number>();
  for (const tf of tfs) for (const w of tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  return tfs.map((tf) => {
    const vector = new Map<string, number>();
    let norm = 0;
    for (const [w, count] of tf) {
      const docs = df.get(w)!;
      if (docs < 2) continue;
      const weight = (1 + Math.log(count)) * Math.log(notes.length / docs);
      vector.set(w, weight);
      norm += weight * weight;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [w, weight] of vector) vector.set(w, weight / norm);
    return vector;
  });
}

export function cosine(a: Map<string, number>, b: Map<string, number>) {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let sum = 0;
  for (const [w, weight] of small) sum += weight * (large.get(w) || 0);
  return sum;
}
