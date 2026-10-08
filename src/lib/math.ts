import katex from 'katex';
import { StateField, type EditorState } from '@codemirror/state';
import { showTooltip, type Tooltip } from '@codemirror/view';

export interface MathSpan {
  from: number;
  to: number;
  tex: string;
  display: boolean;
}

const fence = /^ {0,3}(`{3,}|~{3,})/;

// Finds $…$ and $$…$$ spans the way the preview renders them, skipping
// escaped dollars, inline code and fenced code blocks.
export function mathSpans(text: string): MathSpan[] {
  const spans: MathSpan[] = [];
  let i = 0;
  while (i < text.length) {
    if (i === 0 || text[i - 1] === '\n') {
      const open = text.slice(i, text.indexOf('\n', i) + 1 || undefined).match(fence);
      if (open) {
        const marker = open[1];
        const close = new RegExp(
          `\\n {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*(?=\\n|$)`,
        );
        const rest = text.slice(i).match(close);
        if (!rest) break;
        i += rest.index! + rest[0].length;
        continue;
      }
    }
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
    } else if (ch === '`') {
      const run = text.slice(i).match(/^`+/)![0];
      const end = text.slice(i + run.length).search(new RegExp(`(?<!\`)${run}(?!\`)`));
      i += run.length + (end < 0 ? 0 : end + run.length);
    } else if (ch === '$') {
      const display = text[i + 1] === '$';
      const open = display ? 2 : 1;
      const end = closing(text, i + open, display);
      const tex = end < 0 ? '' : text.slice(i + open, end);
      if (tex.trim()) {
        spans.push({ from: i, to: end + open, tex: tex.trim(), display });
        i = end + open;
      } else {
        i += open;
      }
    } else {
      i++;
    }
  }
  return spans;
}

function closing(text: string, start: number, display: boolean): number {
  for (let j = start; j < text.length; j++) {
    const ch = text[j];
    if (ch === '\\') j++;
    else if (display && ch === '$' && text[j + 1] === '$') return j;
    else if (!display && ch === '$') return text[j + 1] === '$' ? -1 : j;
    // Inline math, like a paragraph, ends at a blank line.
    else if (!display && ch === '\n' && /^\n[ \t]*\n/.test(text.slice(j, j + 80))) return -1;
  }
  return -1;
}

// The span the cursor is in, counting the spot just after the closing delimiter
// so the preview stays up as you finish typing.
export function mathAt(spans: MathSpan[], pos: number): MathSpan | undefined {
  return spans.find((span) => span.from < pos && pos <= span.to);
}

const spansField = StateField.define<MathSpan[]>({
  create: (state) => mathSpans(state.doc.toString()),
  update: (spans, tr) => (tr.docChanged ? mathSpans(tr.state.doc.toString()) : spans),
});

function render(span: MathSpan): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'cm-math-preview';
  dom.setAttribute('aria-hidden', 'true');
  try {
    katex.render(span.tex, dom, {
      displayMode: span.display,
      throwOnError: true,
      trust: false,
      strict: 'ignore',
    });
  } catch (error) {
    dom.classList.add('cm-math-error');
    dom.textContent =
      error instanceof katex.ParseError
        ? error.message.replace(/^KaTeX parse error: /, '')
        : String(error);
  }
  return dom;
}

type MathTooltip = Tooltip & { span: MathSpan };

function tooltipFor(state: EditorState, previous: MathTooltip | null): MathTooltip | null {
  const { main } = state.selection;
  const span = main.empty ? mathAt(state.field(spansField), main.head) : undefined;
  if (!span) return null;
  const same = previous?.span;
  // Keep the same tooltip while the cursor moves inside an unchanged span.
  if (same && same.from === span.from && same.to === span.to && same.tex === span.tex) {
    return previous;
  }
  return {
    span,
    pos: span.display ? span.to : span.from,
    above: false,
    create: () => ({ dom: render(span) }),
  };
}

const previewField = StateField.define<MathTooltip | null>({
  create: (state) => tooltipFor(state, null),
  update: (tooltip, tr) =>
    tr.docChanged || tr.selection ? tooltipFor(tr.state, tooltip) : tooltip,
  provide: (field) => showTooltip.from(field),
});

// Floats a rendered preview under the $…$ or $$…$$ the cursor is in.
export function mathPreview() {
  return [spansField, previewField];
}
