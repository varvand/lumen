<script lang="ts">
  import { onDestroy } from 'svelte';
  import { FilePdf, LinkSimple, Minus, Plus, Quotes, X } from 'phosphor-svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import PdfPage from './PdfPage.svelte';
  import { attachments } from '../lib/attachments.svelte';
  import { closePdf, openPdf } from '../lib/pdfjs';
  import { pageLink, quoteMarkdown } from '../lib/pdf';
  import { ui } from '../lib/ui.svelte';

  /** A PDF beside the note. Selecting text offers to quote it into the note, with its page. */
  let { request }: { request: { name: string; page: number } } = $props();
  const name = $derived(request.name);

  let doc = $state.raw<PDFDocumentProxy | null>(null);
  /** Page sizes at 100%, in CSS pixels. */
  let sizes = $state.raw<{ width: number; height: number }[]>([]);
  let error = $state('');
  let width = $state(0);
  let zoom = $state(1);
  let current = $state(1);
  let scroller = $state<HTMLDivElement>();
  /** Pages near the visible area; only these are drawn. */
  let near = $state<Set<number>>(new Set([1]));
  let selection = $state<{ text: string; page: number; x: number; y: number } | null>(null);

  const fit = $derived(width && sizes[0] ? (width - 40) / sizes[0].width : 1);
  const scale = $derived(Math.max(0.25, fit * zoom));

  let loaded: PDFDocumentProxy | null = null;
  $effect(() => {
    const file = name;
    let cancelled = false;
    doc = null;
    sizes = [];
    error = '';
    void (async () => {
      try {
        const opened = await openPdf(await attachments.bytes(file));
        if (cancelled) return closePdf(opened);
        const pages = await Promise.all(
          Array.from({ length: opened.numPages }, (_, i) =>
            opened.getPage(i + 1).then((p) => p.getViewport({ scale: 1 })),
          ),
        );
        if (cancelled) return closePdf(opened);
        closePdf(loaded);
        loaded = opened;
        sizes = pages.map(({ width, height }) => ({ width, height }));
        doc = opened;
      } catch (e) {
        if (!cancelled)
          error = `This PDF could not be opened. ${String(e).replace(/^Error: /, '')}`;
      }
    })();
    return () => (cancelled = true);
  });
  onDestroy(() => closePdf(loaded));

  // Go to the requested page whenever a link asks for it, including the same page again.
  $effect(() => {
    const target = request.page;
    if (!doc || !scroller || !sizes.length) return;
    const number = Math.min(target, sizes.length);
    queueMicrotask(() => {
      scroller
        ?.querySelector<HTMLElement>(`[data-page="${number}"]`)
        ?.scrollIntoView({ block: 'start' });
      current = number;
    });
  });

  // Draw pages within a screen or so of the visible area.
  $effect(() => {
    if (!scroller || !sizes.length) return;
    void scale;
    const observer = new IntersectionObserver(
      (entries) => {
        const next = new Set(near);
        for (const entry of entries) {
          const number = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) next.add(number);
          else next.delete(number);
        }
        near = next;
      },
      { root: scroller, rootMargin: '900px 0px' },
    );
    for (const page of scroller.querySelectorAll('[data-page]')) observer.observe(page);
    return () => observer.disconnect();
  });

  /** The page under the middle of the view; the last page when scrolled to the end. */
  function track() {
    if (!scroller) return;
    const frame = scroller.getBoundingClientRect();
    const middle = frame.top + frame.height / 2;
    for (const page of scroller.querySelectorAll<HTMLElement>('[data-page]')) {
      if (page.getBoundingClientRect().bottom > middle) {
        current = Number(page.dataset.page);
        break;
      }
    }
  }

  /** After a selection in the PDF, offer to quote it. */
  function select() {
    setTimeout(() => {
      const chosen = window.getSelection();
      const text = chosen?.toString().trim() || '';
      const anchor = chosen?.anchorNode;
      const page = (
        anchor instanceof Element ? anchor : anchor?.parentElement
      )?.closest<HTMLElement>('[data-page]');
      if (!chosen || !text || !page || !scroller?.contains(page)) return (selection = null);
      const box = chosen.getRangeAt(0).getBoundingClientRect();
      const frame = scroller.getBoundingClientRect();
      selection = {
        text,
        page: Number(page.dataset.page),
        x: Math.min(Math.max(box.left + box.width / 2 - frame.left, 90), frame.width - 90),
        y: Math.max(box.top - frame.top + scroller.scrollTop - 46, scroller.scrollTop + 6),
      };
    });
  }
  function quote() {
    if (!selection) return;
    const { text, page } = selection;
    ui.insert(quoteMarkdown(text, name, page));
    window.getSelection()?.removeAllRanges();
    selection = null;
    ui.notify(`Quoted page ${page}`);
  }
</script>

<aside class="pdf-reader" aria-label="PDF reader">
  <header class="pdf-reader-top">
    <FilePdf size={18} />
    <strong title={name}>{name}</strong>
    {#if sizes.length}<span class="subtle">{current} / {sizes.length}</span>{/if}
    <span class="pdf-reader-actions">
      <button
        class="icon-button small"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={zoom <= 0.5}
        onclick={() => (zoom = Math.max(0.5, Math.round((zoom - 0.25) * 100) / 100))}
        ><Minus size={14} /></button
      ><button
        class="icon-button small"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={zoom >= 3}
        onclick={() => (zoom = Math.min(3, Math.round((zoom + 0.25) * 100) / 100))}
        ><Plus size={14} /></button
      ><button
        class="icon-button small"
        aria-label="Link this page in the note"
        title="Link this page in the note"
        disabled={!ui.active || !sizes.length}
        onclick={() => {
          ui.insert(pageLink(name, current));
          ui.notify(`Linked page ${current}`);
        }}><LinkSimple size={15} /></button
      ><button
        class="icon-button small"
        aria-label="Close PDF"
        title="Close"
        onclick={() => ui.closeReader()}><X size={15} /></button
      >
    </span>
  </header>
  <!-- Selecting text is a pointer and keyboard gesture on the text layer itself. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="pdf-scroller"
    bind:this={scroller}
    bind:clientWidth={width}
    onscroll={track}
    onmouseup={select}
    onkeyup={select}
  >
    {#if error}<p role="alert" class="helper danger">{error}</p>
    {:else if !doc}<p class="helper" role="status">Opening {name}…</p>
    {:else}
      {#each sizes as size, i}
        <div
          class="pdf-page"
          data-page={i + 1}
          role="region"
          aria-label={`Page ${i + 1}`}
          style:width={`${size.width * scale}px`}
          style:height={`${size.height * scale}px`}
          style:--total-scale-factor={scale}
        >
          {#if near.has(i + 1)}<PdfPage {doc} number={i + 1} {scale} />{/if}
        </div>
      {/each}
      {#if selection}<div
          class="pdf-selection-actions"
          style:left={`${selection.x}px`}
          style:top={`${selection.y}px`}
        >
          <button
            class="primary-button"
            disabled={!ui.active}
            onmousedown={(e) => e.preventDefault()}
            onclick={quote}><Quotes size={15} weight="fill" /> Quote in note</button
          >
        </div>{/if}
    {/if}
  </div>
</aside>
