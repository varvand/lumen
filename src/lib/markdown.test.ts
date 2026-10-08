import { describe, it, expect } from 'vitest';
import { renderMarkdown, parseImport, headings } from './markdown';
import { seedNotes } from './seeds';

describe('Markdown and math', () => {
  it('renders inline and display math without treating fenced source as math', () => {
    const html = renderMarkdown('Inline $x^2$.\n\n$$\n\\frac{1}{2}\n$$\n\n```text\n$x$\n```');
    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-display');
    expect(html).toContain('<code class="language-text">$x$');
  });
  it('removes executable HTML and unsafe URLs but keeps Markdown tables', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n| A | B |\n| - | - |\n| 1 | 2 |',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('<table>');
  });
  it('preserves equations when importing a titled file with Windows line endings', () => {
    const note = parseImport('\uFEFF# My note\r\n\r\n$$\\sum x_i$$\r\n', 'test.md');
    expect(note.title).toBe('My note');
    expect(note.body).toBe('$$\\sum x_i$$\n');
  });
  it('excludes code-block headings from the outline', () => {
    expect(headings('## Real\n```md\n## Code\n```\n### Next')).toEqual([
      { level: 2, title: 'Real' },
      { level: 3, title: 'Next' },
    ]);
  });
  it('renders all starter notes without math errors', () => {
    for (const note of seedNotes()) expect(renderMarkdown(note.body)).not.toContain('katex-error');
  });
});
