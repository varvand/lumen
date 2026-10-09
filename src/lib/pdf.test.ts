import { describe, expect, it } from 'vitest';
import {
  cleanSelection,
  isPdfTarget,
  pdfKeys,
  pdfName,
  pdfPage,
  quoteMarkdown,
  searchPdfs,
} from './pdf';
import { excerpt, renderMarkdown } from './markdown';

describe('PDF links', () => {
  it('reads the file and page a link points at', () => {
    expect(isPdfTarget('Lecture 5.pdf#page=12')).toBe(true);
    expect(isPdfTarget('Slides/Lecture.PDF')).toBe(true);
    expect(isPdfTarget('Lecture notes')).toBe(false);
    expect(pdfName('Slides/Lecture 5.pdf#page=12')).toBe('Lecture 5.pdf');
    expect(pdfPage('Lecture 5.pdf#page=12')).toBe(12);
    expect(pdfPage('Lecture 5.pdf')).toBe(1);
    expect(pdfPage('Lecture 5.pdf#page=0')).toBe(1);
  });

  it('finds the PDFs a note links to or embeds', () => {
    const body = 'See [[Waves.pdf#page=3]] and ![[Optics.pdf]], not [[Waves]] or `[[Code.pdf]]`.';
    expect(pdfKeys({ id: 'pdf-keys', body })).toEqual(['waves.pdf', 'optics.pdf']);
  });

  it('quotes a selection as one paragraph that links back to its page', () => {
    expect(cleanSelection('Light stays in-\nside the core\n  when  bent.')).toBe(
      'Light stays inside the core when bent.',
    );
    expect(quoteMarkdown('Total internal\nreflection', 'Lecture 5.pdf', 12)).toBe(
      '> Total internal reflection\n>\n> — [[Lecture 5.pdf#page=12|Lecture 5, p. 12]]',
    );
  });

  it('renders PDF links and embeds, marking PDFs that are not in the library', () => {
    const exists = (key: string) => key === 'waves.pdf';
    const html = renderMarkdown('![[Waves.pdf]] and [[Gone.pdf#page=2|old slides]]', exists);
    expect(html).toContain('class="wikilink pdf-link pdf-embed"');
    expect(html).toContain('data-wikilink="Waves.pdf"');
    expect(html).not.toContain('!<a');
    expect(html).toContain('class="wikilink wikilink-missing pdf-link"');
    expect(html).toContain('>old slides</a>');
  });

  it('previews an embedded PDF by name, without the embed marker', () => {
    expect(excerpt('Notes. ![[Waves.pdf]]')).toBe('Notes. Waves.pdf');
  });
});

describe('PDF search', () => {
  const texts = [
    { name: 'Optics.pdf', size: 1, pages: ['Snell law', 'Total internal\nreflection keeps light'] },
    { name: 'Waves.pdf', size: 1, pages: ['Reflection at a boundary', 'reflection again'] },
  ];

  it('finds pages that contain the words, with the text around them', () => {
    expect(searchPdfs(texts, 'internal reflection')).toEqual([
      { name: 'Optics.pdf', page: 2, snippet: 'Total internal reflection keeps light' },
    ]);
    expect(searchPdfs(texts, 'reflection').map((m) => `${m.name} ${m.page}`)).toEqual([
      'Optics.pdf 2',
      'Waves.pdf 1',
      'Waves.pdf 2',
    ]);
    expect(searchPdfs(texts, 'reflection', 2, 1)).toHaveLength(2);
    expect(searchPdfs(texts, 'r')).toEqual([]);
  });

  it('shortens long pages around the match', () => {
    const page = `${'a '.repeat(60)}needle${' b'.repeat(60)}`;
    const [match] = searchPdfs([{ name: 'Long.pdf', size: 1, pages: [page] }], 'needle');
    expect(match.snippet.startsWith('…')).toBe(true);
    expect(match.snippet.endsWith('…')).toBe(true);
    expect(match.snippet).toContain('needle');
  });
});
