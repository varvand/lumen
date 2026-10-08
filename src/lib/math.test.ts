import { describe, it, expect } from 'vitest';
import { mathSpans, mathAt } from './math';

const tex = (text: string) => mathSpans(text).map((span) => [span.tex, span.display]);

describe('Math spans', () => {
  it('finds inline and display math with their positions', () => {
    const text = 'Let $x^2$ be.\n\n$$\n\\frac{1}{2}\n$$\n';
    const spans = mathSpans(text);
    expect(spans).toEqual([
      { from: 4, to: 9, tex: 'x^2', display: false },
      { from: 15, to: 32, tex: '\\frac{1}{2}', display: true },
    ]);
    expect(text.slice(spans[1].from, spans[1].to)).toBe('$$\n\\frac{1}{2}\n$$');
  });
  it('skips escaped dollars, inline code and fenced code', () => {
    expect(tex('Costs \\$5 and `$x$` here')).toEqual([]);
    expect(tex('```text\n$x$\n```\nThen $y$')).toEqual([['y', false]]);
    expect(tex('~~~\n$$a$$\n~~~')).toEqual([]);
    expect(tex('$\\$5$')).toEqual([['\\$5', false]]);
  });
  it('ignores unclosed and empty math, and stops inline math at a blank line', () => {
    expect(tex('Typing $x^2')).toEqual([]);
    expect(tex('$ $ and $$ $$')).toEqual([]);
    expect(tex('$a\n\nb$')).toEqual([]);
    expect(tex('$a\nb$')).toEqual([['a\nb', false]]);
  });
  it('finds the span at the cursor, including just after it closes', () => {
    const spans = mathSpans('a $x$ b');
    expect(mathAt(spans, 2)).toBeUndefined();
    expect(mathAt(spans, 3)?.tex).toBe('x');
    expect(mathAt(spans, 5)?.tex).toBe('x');
    expect(mathAt(spans, 6)).toBeUndefined();
  });
});
