import { describe, expect, it } from 'vitest';
import { linkGraph, linkKey, linkKeys, linkLabel, titleIndex } from './links';
import { renderMarkdown } from './markdown';
import { seedNotes } from './seeds';
import type { Note } from './types';

const note = (id: string, title: string, body = ''): Note => ({
  ...seedNotes()[0],
  id,
  title,
  body,
});

describe('wikilinks', () => {
  it('reads the note a link points at and the text it shows', () => {
    expect(linkKey('Optics/Lenses#Focus')).toBe('lenses');
    expect(linkKey('Wave Equation.md')).toBe('wave equation');
    expect(linkLabel('Optics/Lenses#Focus')).toBe('Lenses');
    expect(linkLabel('Optics/Lenses', ' lenses ')).toBe('lenses');
    expect(linkLabel('#Heading')).toBe('Heading');
  });

  it('finds distinct links outside code', () => {
    const body =
      'See [[Waves]], [[waves|again]] and [[Optics/Lenses]].\n\n`[[Inline]]`\n\n```\n[[Fenced]]\n```';
    expect(linkKeys(note('a', 'A', body))).toEqual(['waves', 'lenses']);
  });

  it('builds links and backlinks between notes by title', () => {
    const notes = [
      note('a', 'Waves', 'Links to [[Lenses]] and [[Waves]] and [[Missing]].'),
      note('b', 'Lenses', 'Back to [[waves]].'),
      note('c', 'Optics', '[[Lenses]] and [[Lenses|again]].'),
    ];
    const graph = linkGraph(notes, titleIndex(notes));
    expect(graph.edges).toEqual([
      ['a', 'b'],
      ['b', 'a'],
      ['c', 'b'],
    ]);
    expect(graph.backlinks.get('b')).toEqual(['a', 'c']);
    expect(graph.backlinks.get('a')).toEqual(['b']);
    expect(graph.backlinks.get('c')).toBeUndefined();
  });

  it('renders links to notes, marks missing ones, and leaves code alone', () => {
    const html = renderMarkdown(
      'See [[Waves]], [[Optics/Lenses|lenses]] and [[Nope]].\n\n`[[code]]`\n\n- **[[Bold]]**',
      (key) => key !== 'nope',
    );
    expect(html).toContain('<a href="#" class="wikilink" data-wikilink="Waves">Waves</a>');
    expect(html).toContain('data-wikilink="Optics/Lenses">lenses</a>');
    expect(html).toContain('class="wikilink wikilink-missing" data-wikilink="Nope"');
    expect(html).toContain('<code>[[code]]</code>');
    expect(html).toContain('<strong><a href="#" class="wikilink" data-wikilink="Bold">Bold</a>');
  });

  it('keeps link text from turning into HTML', () => {
    const html = renderMarkdown('[[<img src=x onerror=alert(1)>]]');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror="');
  });
});
