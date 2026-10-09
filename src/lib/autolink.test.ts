import { describe, it, expect } from 'vitest';
import {
  BATCH,
  digest,
  likelyPairs,
  linkRequest,
  parseLinks,
  pendingLinks,
  withLinks,
} from './autolink';
import { linkGraph } from './links';
import type { Note } from './types';

let time = 1000;
function note(title: string, body = '', tags: string[] = []): Note {
  time += 1;
  return {
    id: title.toLowerCase().replace(/\W+/g, '-') || `n${time}`,
    title,
    body,
    collection: 'Personal',
    tags,
    intent: 'reference',
    pinned: false,
    inbox: false,
    trashed: false,
    createdAt: time,
    updatedAt: time,
    revision: 1,
    prompts: [],
    source: '',
  };
}

describe('Link suggestions', () => {
  it('keeps only the opening prose of a note', () => {
    const body =
      '## Heading\n\nPlants use **light** to make [[Sugar|sugar]].\n\n```js\nnoise()\n```\n\n$$x^2$$\n\n' +
      'word '.repeat(100);
    const text = digest(body);
    expect(text.startsWith('Heading Plants use light to make sugar. word')).toBe(true);
    expect(text).not.toMatch(/noise|x\^2|\*\*|\[\[/);
    expect(text.length).toBeLessThanOrEqual(301);
    expect(text.endsWith('…')).toBe(true);
  });

  it('drops tables down to their cells', () => {
    expect(digest('| Want | Write |\n| :--- | ---: |\n| bold | **x** |')).toBe('Want Write bold x');
  });

  const ml = () =>
    note(
      'Mathematical Basics of Machine Learning',
      'Linear algebra, calculus and optimization. Gradient descent follows the gradient of the ' +
        'loss; the chain rule gives derivatives of composed functions; a layer computes Wx + b.',
    );
  const backprop = () =>
    note(
      'How Backpropagation Works',
      'Backpropagation computes the gradient of the loss for every weight with the chain rule, ' +
        'then gradient descent updates each layer.',
    );
  const unrelated = () =>
    note('Sourdough', 'Feed the starter with flour and water, then bake the loaf in a hot oven.');

  it('pairs notes that share distinctive words, even when neither names the other', () => {
    const notes = [ml(), backprop(), unrelated(), note('Packing list', 'Passport and charger.')];
    const pairs = likelyPairs(notes, linkGraph(notes));
    expect(pairs.map(({ from, to }) => `${from.title} > ${to.title}`)).toEqual([
      'How Backpropagation Works > Mathematical Basics of Machine Learning',
    ]);
  });

  it('skips pairs already linked either way, and notes with ambiguous titles', () => {
    const linked = [ml(), backprop(), unrelated()];
    linked[0].body += ' See [[How Backpropagation Works]].';
    expect(likelyPairs(linked, linkGraph(linked))).toEqual([]);
    const same = [ml(), backprop(), unrelated(), backprop()];
    expect(likelyPairs(same, linkGraph(same))).toEqual([]);
  });

  it('describes only the notes in likely pairs, as short digests', () => {
    const notes = [ml(), backprop(), unrelated()];
    const request = linkRequest(notes, linkGraph(notes), {})!;
    expect(request.pairs).toHaveLength(1);
    expect(request.prompt).toContain(
      'NOTES\nHow Backpropagation Works |  | Backpropagation computes',
    );
    expect(request.prompt).toContain(
      'PAIRS\nP1: How Backpropagation Works / Mathematical Basics of Machine Learning',
    );
    expect(request.prompt).not.toContain('Sourdough');
  });

  it('checks a pair again only after either note changes, and batches large libraries', () => {
    const topics = Array.from({ length: BATCH + 10 }, (_, i) => `topic${i}`);
    // Each note shares one distinctive word with the next, so every neighbor pair is likely.
    const notes = topics.map((t, i) =>
      note(`Note ${i}`, `${t} ${topics[(i + 1) % topics.length]} ${'filler '.repeat(3)}`),
    );
    const graph = linkGraph(notes);
    const first = linkRequest(notes, graph, {})!;
    expect(first.pairs).toHaveLength(BATCH);
    expect(first.remaining).toBeGreaterThan(0);
    const version = ({ from, to }: { from: Note; to: Note }) =>
      from.id < to.id
        ? [`${from.id} ${to.id}`, `${from.updatedAt} ${to.updatedAt}`]
        : [`${to.id} ${from.id}`, `${to.updatedAt} ${from.updatedAt}`];
    const checked = Object.fromEntries(first.pairs.map(version));
    expect(linkRequest(notes, graph, checked)!.pairs).toHaveLength(first.remaining);
    const all = Object.fromEntries(
      [...first.pairs, ...linkRequest(notes, graph, checked)!.pairs].map(version),
    );
    expect(linkRequest(notes, graph, all)).toBeUndefined();
    first.pairs[0].from.updatedAt += 10_000;
    expect(linkRequest(notes, graph, all)!.pairs.length).toBeGreaterThan(0);
  });

  it('reads the pairs answered yes and ignores the rest', () => {
    const notes = [ml(), backprop(), unrelated()];
    const request = linkRequest(notes, linkGraph(notes), {})!;
    const [pair] = request.pairs;
    expect(parseLinks('P1 yes', request)).toEqual([pair]);
    expect(parseLinks('- **P1:** Yes, both cover gradients', request)).toEqual([pair]);
    expect(parseLinks('1 - yes\nP1 yes\nP7 yes', request)).toEqual([pair]);
    expect(parseLinks('P1 no', request)).toEqual([]);
    expect(parseLinks('P1 no, not yes', request)).toEqual([]);
  });

  it('keeps saved suggestions only while both notes exist and are still unlinked', () => {
    const a = note('A', 'see [[B]]');
    const b = note('B');
    const c = note('C');
    const d = note('D');
    d.trashed = true;
    const notes = [a, b, c, d];
    const get = (id: string) => notes.find((n) => n.id === id);
    const pairs: [string, string][] = [
      [a.id, b.id],
      [c.id, a.id],
      [a.id, c.id],
      [c.id, d.id],
      [c.id, 'gone'],
    ];
    const links = pendingLinks(pairs, get, linkGraph(notes)).map(
      ({ from, to }) => `${from.title}>${to.title}`,
    );
    expect(links).toEqual(['C>A']);
  });

  it('adds links on a Related line at the end of a note', () => {
    expect(withLinks('Text\n', ['B'])).toBe('Text\n\nRelated: [[B]]\n');
    expect(withLinks('Text\n\nRelated: [[B]]\n', ['C', 'D'])).toBe(
      'Text\n\nRelated: [[B]] · [[C]] · [[D]]\n',
    );
    expect(withLinks('', ['B'])).toBe('Related: [[B]]\n');
  });
});
