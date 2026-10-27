// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { cleanSvg, FLOWCHART_TEMPLATE, isDiagramLanguage } from './flowchart';
import { renderMarkdown } from './markdown';

describe('flowcharts', () => {
  it('recognizes mermaid code blocks by their language', () => {
    expect(isDiagramLanguage('mermaid')).toBe(true);
    expect(isDiagramLanguage(' Mermaid title')).toBe(true);
    expect(isDiagramLanguage('js')).toBe(false);
    expect(isDiagramLanguage('')).toBe(false);
    expect(isDiagramLanguage(undefined)).toBe(false);
  });

  it('inserts a block that is a complete mermaid flowchart', () => {
    const lines = FLOWCHART_TEMPLATE.split('\n');
    expect(lines[0]).toBe('```mermaid');
    expect(lines[1]).toBe('flowchart TD');
    expect(lines.at(-1)).toBe('```');
  });

  it('keeps the diagram source as inert text in rendered Markdown', () => {
    const html = renderMarkdown(
      '```mermaid\nflowchart TD\n  A["<img src=x onerror=alert(1)>"] --> B\n```',
    );
    expect(html).toContain('class="language-mermaid"');
    expect(html).not.toContain('<img');
    expect(html).toContain('&#x3C;img');
  });

  it('strips scripts, handlers, foreign content and external links from a drawn diagram', () => {
    const dirty =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="x()">' +
      '<script>alert(1)</script><foreignObject><div>hi</div></foreignObject>' +
      '<a xlink:href="javascript:alert(1)"><text onclick="x()">A</text></a>' +
      '<use href="#node"/><image href="https://example.com/a.png"/></svg>';
    const clean = cleanSvg(dirty);
    expect(clean).toContain('<text>A</text>');
    expect(clean).toContain('href="#node"');
    expect(clean).not.toMatch(/script|foreignObject|onload|onclick|javascript|example\.com/i);
  });

  it('rejects output that is not an SVG', () => {
    expect(cleanSvg('<div>no</div>')).toBe('');
    expect(cleanSvg('<svg')).toBe('');
  });
});
