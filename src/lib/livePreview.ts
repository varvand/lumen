import katex from 'katex';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { mathSpans } from './math';

/** Rendered $…$ or $$…$$, shown where its source is hidden. */
class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super();
  }
  eq(other: MathWidget) {
    return other.tex === this.tex && other.display === this.display;
  }
  toDOM() {
    const dom = document.createElement(this.display ? 'div' : 'span');
    dom.className = this.display ? 'cm-lp-math cm-lp-math-display' : 'cm-lp-math';
    try {
      katex.render(this.tex, dom, {
        displayMode: this.display,
        throwOnError: true,
        trust: false,
        strict: 'ignore',
      });
    } catch {
      // Unfinished or invalid math stays as source until it parses.
      dom.textContent = this.display ? `$$${this.tex}$$` : `$${this.tex}$`;
      dom.classList.add('cm-lp-math-error');
    }
    return dom;
  }
  ignoreEvent() {
    return false;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const dom = document.createElement('span');
    dom.className = 'cm-lp-bullet';
    dom.textContent = '•';
    return dom;
  }
}

/** A task's [ ] or [x], clickable without revealing its source. */
class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: TaskWidget) {
    return other.checked === this.checked;
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-lp-task';
    box.checked = this.checked;
    box.setAttribute('aria-label', this.checked ? 'Completed task' : 'Open task');
    box.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const from = view.posAtDOM(box);
      view.dispatch({
        changes: { from: from + 1, to: from + 2, insert: this.checked ? ' ' : 'x' },
      });
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const code = Decoration.mark({ class: 'cm-lp-code' });
const line = (cls: string) => Decoration.line({ class: cls });

/** Lines the selection touches show their Markdown; every other line shows the result. */
function activeLines(state: EditorState) {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number;
    for (let n = state.doc.lineAt(range.from).number; n <= last; n++) lines.add(n);
  }
  return lines;
}

function build(state: EditorState): DecorationSet {
  const { doc } = state;
  const active = activeLines(state);
  const isActive = (from: number, to = from) => {
    for (let n = doc.lineAt(from).number, last = doc.lineAt(to).number; n <= last; n++)
      if (active.has(n)) return true;
    return false;
  };
  const decorations: Range<Decoration>[] = [];
  const math = mathSpans(doc.toString());
  const inMath = (from: number, to: number) => math.some((s) => from >= s.from && to <= s.to);

  for (const span of math) {
    if (isActive(span.from, span.to)) continue;
    const start = doc.lineAt(span.from);
    const end = doc.lineAt(span.to);
    const ownLines =
      span.display && span.from === start.from && span.to === end.to && start.number < end.number;
    decorations.push(
      Decoration.replace({
        widget: new MathWidget(span.tex, span.display),
        block: ownLines,
      }).range(span.from, span.to),
    );
  }

  const tree = ensureSyntaxTree(state, doc.length, 50) ?? syntaxTree(state);
  tree.iterate({
    enter: (node) => {
      const { from, to, name } = node;
      if (name === 'FencedCode' || name === 'CodeBlock') {
        for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++)
          decorations.push(line('cm-lp-code-block').range(doc.line(n).from));
        return false;
      }
      if (inMath(from, to)) return false;
      const heading = /^ATXHeading(\d)$/.exec(name);
      if (heading) {
        decorations.push(line(`cm-lp-h${heading[1]}`).range(doc.lineAt(from).from));
        return;
      }
      if (name === 'Blockquote') {
        for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++)
          decorations.push(line('cm-lp-quote').range(doc.line(n).from));
        return;
      }
      if (name === 'InlineCode') decorations.push(code.range(from, to));
      if (isActive(from, to) && name !== 'Link') return;
      switch (name) {
        case 'HeaderMark': {
          // Hide "## " together with the space after it.
          const space = doc.sliceString(to, to + 1) === ' ' ? 1 : 0;
          if (node.node.parent?.name.startsWith('ATXHeading'))
            decorations.push(hide.range(from, to + space));
          break;
        }
        case 'EmphasisMark':
        case 'StrikethroughMark':
        case 'CodeMark':
          if (node.node.parent?.name !== 'FencedCode') decorations.push(hide.range(from, to));
          break;
        case 'QuoteMark': {
          const space = doc.sliceString(to, to + 1) === ' ' ? 1 : 0;
          decorations.push(hide.range(from, to + space));
          break;
        }
        case 'ListMark': {
          const list = node.node.parent?.parent?.name;
          const task = node.node.parent?.getChild('Task');
          if (task) decorations.push(hide.range(from, task.from));
          else if (list === 'BulletList') decorations.push(bullet.range(from, to));
          break;
        }
        case 'TaskMarker': {
          const checked = doc.sliceString(from + 1, from + 2).toLowerCase() === 'x';
          decorations.push(Decoration.replace({ widget: new TaskWidget(checked) }).range(from, to));
          break;
        }
        case 'HorizontalRule':
          decorations.push(line('cm-lp-rule').range(doc.lineAt(from).from), hide.range(from, to));
          break;
        case 'Link': {
          // [text](url) reads as its text until the cursor reaches it.
          if (isActive(from, to)) return false;
          const marks = node.node.getChildren('LinkMark');
          // Only inline [text](url) links; [[wikilinks]] and references keep their brackets.
          const inline =
            marks.length >= 3 && doc.sliceString(marks[1].from, marks[1].to + 1) === '](';
          if (!inline || doc.sliceString(from, from + 2) === '[[') return false;
          decorations.push(hide.range(marks[0].from, marks[0].to));
          decorations.push(
            Decoration.mark({ class: 'cm-lp-link' }).range(marks[0].to, marks[1].from),
          );
          decorations.push(hide.range(marks[1].from, to));
          return false;
        }
      }
    },
  });
  return Decoration.set(decorations, true);
}

const livePreviewField = StateField.define<DecorationSet>({
  create: build,
  update: (decorations, tr) =>
    tr.docChanged || tr.selection || syntaxTree(tr.state) !== syntaxTree(tr.startState)
      ? build(tr.state)
      : decorations,
  provide: (field) => EditorView.decorations.from(field),
});

/** Render Markdown in place, revealing the source on the lines being edited. */
export function livePreview() {
  return [
    livePreviewField,
    EditorView.baseTheme({
      '.cm-lp-h1': { fontSize: '1.6em', lineHeight: '1.5' },
      '.cm-lp-h2': { fontSize: '1.35em', lineHeight: '1.5' },
      '.cm-lp-h3': { fontSize: '1.15em' },
      '.cm-lp-h1, .cm-lp-h2, .cm-lp-h3, .cm-lp-h4, .cm-lp-h5, .cm-lp-h6': { fontWeight: '600' },
      '.cm-lp-quote': {
        borderLeft: '3px solid var(--border)',
        paddingLeft: '12px !important',
        color: 'var(--secondary)',
      },
      '.cm-lp-code, .cm-lp-code-block': { backgroundColor: 'var(--surface)' },
      '.cm-lp-code': { borderRadius: '4px', padding: '1px 3px' },
      '.cm-lp-code-block': { paddingLeft: '10px !important' },
      '.cm-lp-rule': { position: 'relative' },
      '.cm-lp-rule::after': {
        content: '""',
        position: 'absolute',
        left: '0',
        right: '0',
        top: '50%',
        borderTop: '1px solid var(--border)',
      },
      '.cm-lp-link': { color: 'var(--accent)', textDecoration: 'underline' },
      '.cm-lp-bullet': { color: 'var(--muted)' },
      '.cm-lp-task': {
        margin: '0 4px 0 0',
        verticalAlign: 'middle',
        cursor: 'pointer',
        accentColor: 'var(--accent)',
      },
      '.cm-lp-math': { fontFamily: 'initial' },
      '.cm-lp-math-display': { padding: '6px 0', textAlign: 'center', overflowX: 'auto' },
      '.cm-lp-math-error': { color: 'var(--muted)' },
    }),
  ];
}
