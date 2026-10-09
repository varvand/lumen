import { describe, it, expect } from 'vitest';
import { BATCH, digest, linkRequest, parseLinks, pendingLinks, withLinks } from './autolink';
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
      'word '.repeat(80);
    const text = digest(body);
    expect(text.startsWith('Heading Plants use light to make sugar. word')).toBe(true);
    expect(text).not.toMatch(/noise|x\^2|\*\*|\[\[/);
    expect(text.length).toBeLessThanOrEqual(201);
    expect(text.endsWith('…')).toBe(true);
  });

  it('drops tables down to their cells', () => {
    expect(digest('| Want | Write |\n| :--- | ---: |\n| bold | **x** |')).toBe('Want Write bold x');
  });

  it('describes only unlinked notes and lists linked ones by title alone', () => {
    const linked = note('Cell respiration', 'Long private text. See [[Mitochondria]].');
    const target = note('Mitochondria', 'Also linked, never described.');
    const lonely = note('Photosynthesis', 'Plants turn light into sugar.', ['biology']);
    const notes = [linked, target, lonely];
    const request = linkRequest(notes, linkGraph(notes), {})!;
    expect(request.described).toBe(1);
    expect(request.prompt).toContain(
      '1 | Photosynthesis | #biology | Plants turn light into sugar.',
    );
    expect(request.prompt).toMatch(/\n\d \| Mitochondria\n/);
    expect(request.prompt).not.toContain('Long private text');
    expect(request.prompt).not.toContain('never described');
  });

  it('skips notes already checked until they are edited, and batches large libraries', () => {
    const notes = Array.from({ length: BATCH + 5 }, (_, i) => note(`Note ${i}`, 'text'));
    const graph = linkGraph(notes);
    const first = linkRequest(notes, graph, {})!;
    expect(first.described).toBe(BATCH);
    expect(first.remaining).toBe(5);
    const checked = Object.fromEntries(
      first.notes.slice(0, first.described).map((n) => [n.id, n.updatedAt]),
    );
    expect(linkRequest(notes, graph, checked)!.described).toBe(5);
    const all = Object.fromEntries(notes.map((n) => [n.id, n.updatedAt]));
    expect(linkRequest(notes, graph, all)).toBeUndefined();
    notes[0].updatedAt += 1;
    expect(linkRequest(notes, graph, all)!.notes[0].id).toBe(notes[0].id);
  });

  it('leaves out titles a link cannot name', () => {
    const notes = [note('Same'), note('Same'), note('A [draft]'), note('Fine')];
    const request = linkRequest(notes, linkGraph(notes), {})!;
    expect(request.notes.map((n) => n.title)).toEqual(['Fine']);
  });

  it('reads number pairs and drops invalid, repeated and reversed ones', () => {
    const notes = [note('A'), note('B'), note('C', 'see [[D]]'), note('D')];
    const request = linkRequest(notes, linkGraph(notes), {})!;
    const names = request.notes.map((n) => n.title);
    const at = (title: string) => names.indexOf(title) + 1;
    const answer = [
      `${at('A')} ${at('B')}`,
      `${at('B')} -> ${at('A')}`,
      `1. ${at('A')} ${at('C')}`,
      `${at('C')} ${at('A')}`,
      `${at('A')} ${at('A')}`,
      `${at('A')} 99`,
      'none',
    ].join('\n');
    const links = parseLinks(answer, request).map(({ from, to }) => `${from.title}>${to.title}`);
    expect(links).toEqual(['A>B', 'A>C']);
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
