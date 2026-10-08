import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';

/** After [[, suggest note titles; picking one completes the link and its closing ]]. */
export function linkCompletion(titles: () => string[]) {
  function complete(context: CompletionContext): CompletionResult | null {
    const match = context.matchBefore(/\[\[[^[\]|\n]*$/);
    if (!match) return null;
    const closed = context.state.sliceDoc(context.pos, context.pos + 2) === ']]';
    return {
      from: match.from + 2,
      options: titles().map((title) => ({
        label: title,
        apply: (view: EditorView, _: unknown, from: number, to: number) =>
          view.dispatch({
            changes: { from, to, insert: closed ? title : `${title}]]` },
            selection: { anchor: from + title.length + 2 },
          }),
      })),
      validFor: /^[^[\]|\n]*$/,
    };
  }
  return [
    autocompletion({ override: [complete], icons: false }),
    EditorView.theme({
      '.cm-tooltip.cm-tooltip-autocomplete': {
        background: 'var(--surface)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        boxShadow: '0 6px 20px #0000001f',
        overflow: 'hidden',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul': {
        fontFamily: '"DM Sans Variable", sans-serif',
        maxHeight: '16em',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px' },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        background: 'var(--accent-soft)',
        color: 'var(--text)',
      },
      '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--accent)' },
    }),
  ];
}
