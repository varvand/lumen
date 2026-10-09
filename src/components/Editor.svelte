<script lang="ts">
  import { onMount } from 'svelte';
  import { Compartment, EditorState } from '@codemirror/state';
  import {
    EditorView,
    keymap,
    placeholder,
    drawSelection,
    highlightActiveLine,
  } from '@codemirror/view';
  import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
  import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
  import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
  import { tags } from '@lezer/highlight';
  import { livePreview } from '../lib/livePreview';
  import { preferences } from '../lib/preferences.svelte';
  import { mathPreview } from '../lib/math';
  import { linkCompletion } from '../lib/linkCompletion';

  let {
    value,
    onchange,
    linkTitles = () => [],
  }: {
    value: string;
    onchange: (text: string) => void;
    /** Note titles offered after typing [[. */
    linkTitles?: () => string[];
  } = $props();
  let element: HTMLDivElement;
  let view: EditorView | undefined;
  let internal = '';
  let syncing = false;
  const preview = new Compartment();
  /** Until the editor is clicked into, inserted blocks go at the end, not at the top. */
  let placedCursor = false;

  export function format(before: string, after = before, fallback = 'text') {
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to) || fallback;
    view.dispatch({
      changes: { from, to, insert: before + selected + after },
      selection: { anchor: from + before.length, head: from + before.length + selected.length },
    });
    view.focus();
  }
  /** Insert Markdown as its own paragraph after the cursor's line, and put the cursor after it. */
  export function insertBlock(markdown: string) {
    if (!view) return;
    const { doc } = view.state;
    const line = placedCursor ? doc.lineAt(view.state.selection.main.head) : doc.line(doc.lines);
    const before = line.text.trim() ? '\n\n' : line.number > 1 ? '\n' : '';
    const insert = `${before}${markdown}\n`;
    view.dispatch({
      changes: { from: line.to, insert },
      selection: { anchor: line.to + insert.length },
      scrollIntoView: true,
    });
    placedCursor = true;
  }
  onMount(() => {
    internal = value;
    view = new EditorView({
      parent: element,
      state: EditorState.create({
        doc: value,
        extensions: [
          markdown({ base: markdownLanguage }),
          preview.of(preferences.livePreview ? livePreview() : []),
          linkCompletion(() => linkTitles()),
          history(),
          drawSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          mathPreview(),
          placeholder(
            'An idea starts here…\n\nWrite in Markdown. Use $…$ for inline math and $$…$$ for equations.',
          ),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Markdown editor', spellcheck: 'true' }),
          keymap.of([
            {
              key: 'Mod-b',
              run: () => {
                format('**');
                return true;
              },
            },
            {
              key: 'Mod-i',
              run: () => {
                format('*');
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
          ]),
          syntaxHighlighting(
            HighlightStyle.define([
              { tag: tags.heading, color: 'var(--text)', fontWeight: '600' },
              { tag: tags.heading2, fontSize: '1.2em' },
              { tag: tags.strong, fontWeight: '600', color: 'var(--text)' },
              { tag: tags.emphasis, fontStyle: 'italic' },
              { tag: [tags.link, tags.url], color: 'var(--accent)' },
              { tag: [tags.monospace, tags.string], color: 'var(--accent)' },
              { tag: [tags.processingInstruction, tags.meta], color: 'var(--muted)' },
              { tag: tags.quote, color: 'var(--secondary)', fontStyle: 'italic' },
            ]),
          ),
          EditorView.theme({
            '&': { fontSize: 'var(--editor-size, 14px)', color: 'var(--text)', height: '100%' },
            '.cm-content': {
              fontFamily: '"IBM Plex Mono", monospace',
              lineHeight: '1.9',
              padding: '24px 0 120px',
              caretColor: 'var(--accent)',
            },
            '.cm-scroller': { overflow: 'auto', fontFamily: '"IBM Plex Mono", monospace' },
            '&.cm-focused': { outline: 'none' },
            '.cm-line': { padding: '0' },
            '.cm-activeLine': { backgroundColor: 'transparent' },
            // Matches CodeMirror's own focused-selection selector so the theme color wins.
            '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ::selection':
              { backgroundColor: 'var(--selection)' },
            '.cm-cursor': { borderLeftColor: 'var(--accent)' },
            '.cm-placeholder': { color: 'var(--muted)' },
            '.cm-panels': {
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            },
            '.cm-search': { padding: '10px', fontFamily: '"DM Sans Variable", sans-serif' },
            '.cm-tooltip.cm-math-preview': {
              padding: '8px 12px',
              maxWidth: 'min(560px, 90vw)',
              overflowX: 'auto',
              color: 'var(--text)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow)',
            },
            '.cm-math-preview .katex-display': { margin: '0' },
            '.cm-tooltip.cm-math-error': {
              color: 'var(--muted)',
              fontFamily: '"DM Sans Variable", sans-serif',
              fontSize: '12px',
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.focusChanged && update.view.hasFocus) placedCursor = true;
            if (update.docChanged) {
              internal = update.state.doc.toString();
              if (!syncing) onchange(internal);
            }
          }),
        ],
      }),
    });
    return () => view?.destroy();
  });
  $effect(() => {
    const enabled = preferences.livePreview;
    view?.dispatch({ effects: preview.reconfigure(enabled ? livePreview() : []) });
  });
  $effect(() => {
    if (view && value !== internal) {
      internal = value;
      syncing = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      syncing = false;
    }
  });
</script>

<div class="editor-mount" bind:this={element}></div>
