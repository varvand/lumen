<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { ArrowLeft, ArrowRight, ArrowsIn, Graph, Sparkle } from 'phosphor-svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { GraphLayout } from '../lib/graphLayout';
  import { tagHue } from '../lib/format';
  import type { Note } from '../lib/types';
  import { attachments } from '../lib/attachments.svelte';
  import { preferences } from '../lib/preferences.svelte';
  import { pdfKeys } from '../lib/pdf';
  import { tutor, PROVIDER_NAMES, type Provider } from '../lib/tutor';
  import {
    checkedPairs,
    linkRequest,
    parseLinks,
    pendingLinks,
    savedSuggestions,
    withLinks,
    type LinkSuggestion,
  } from '../lib/autolink';

  const layout = new GraphLayout();
  const showUnlinked = $derived(ui.isExpanded('graph:unlinked', true));
  const colorCollections = $derived(ui.isExpanded('graph:collections', false));
  /** PDFs are drawn when they are included in search and the graph, and there are some. */
  const hasPdfs = $derived(attachments.enabled && attachments.list.length > 0);
  const showPdfs = $derived(hasPdfs && preferences.pdfIndex);

  /** A note, or a PDF that notes link to. */
  type GraphNode = { id: string; title: string; note?: Note; pdf?: string };

  const graph = $derived.by(() => {
    const allEdges = [...library.links.edges];
    if (showPdfs)
      for (const note of library.live)
        for (const key of pdfKeys(note)) {
          const pdf = attachments.byKey.get(key);
          if (pdf) allEdges.push([note.id, `pdf:${pdf.name}`]);
        }
    const degree = new Map<string, number>();
    for (const [from, to] of allEdges) {
      degree.set(from, (degree.get(from) || 0) + 1);
      degree.set(to, (degree.get(to) || 0) + 1);
    }
    const nodes: GraphNode[] = [
      ...library.live.map((note) => ({ id: note.id, title: note.title, note })),
      ...(showPdfs
        ? attachments.list.map((pdf) => ({ id: `pdf:${pdf.name}`, title: pdf.name, pdf: pdf.name }))
        : []),
    ].filter((node) => showUnlinked || degree.has(node.id));
    const ids = new Set(nodes.map((node) => node.id));
    const edges = allEdges.filter(([from, to]) => ids.has(from) && ids.has(to));
    const pdfCount = nodes.filter((node) => node.pdf).length;
    return { nodes, edges, degree, pdfCount, noteCount: nodes.length - pdfCount };
  });
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const counts = $derived(
    [
      count(graph.noteCount, 'note', 'notes'),
      ...(graph.pdfCount ? [count(graph.pdfCount, 'PDF', 'PDFs')] : []),
      count(graph.edges.length, 'link', 'links'),
    ].join(' · '),
  );
  /** Changes only when notes or links are added or removed, not on every keystroke. */
  const shape = $derived(
    graph.nodes.map((node) => node.id).join('\n') + '\n\n' + graph.edges.join('\n'),
  );

  let positions = $state.raw<{ x: number; y: number }[]>([]);
  let links = $state.raw<[number, number][]>([]);
  let view = $state({ x: 0, y: 0, k: 1 });
  let width = $state(0);
  let height = $state(0);
  let hovered = $state(-1);
  let svg = $state<SVGSVGElement>();
  /** Keep the whole graph in view until the person pans or zooms. */
  let autoFit = true;
  let raf = 0;
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Suggesting links needs a connected chat app, which only the desktop app has.
  let providers = $state<Provider[]>([]);
  const provider = $derived(tutor.preferred(providers));
  tutor
    .providers()
    .then((found) => (providers = found))
    .catch(() => {});
  let finding = $state(false);
  let suggestions = $state<(LinkSuggestion & { keep: boolean })[] | null>(null);
  let remaining = $state(0);
  /** The pair of notes a suggestion row is pointing at. */
  let previewPair = $state<string[]>([]);
  /** Suggestions not yet added or turned down, still valid for the current notes. */
  let savedPairs = $state(savedSuggestions.load());
  const saved = $derived(pendingLinks(savedPairs, (id) => library.get(id), library.links));

  function show(links: LinkSuggestion[]) {
    suggestions = links.map((link) => ({ ...link, keep: true }));
  }
  function store(links: LinkSuggestion[]) {
    savedSuggestions.save(links);
    savedPairs = savedSuggestions.load();
  }
  function hide() {
    suggestions = null;
    previewPair = [];
  }

  /** Show saved suggestions, asking the chat app only about likely pairs not checked yet. */
  async function suggestLinks() {
    if (!provider || finding) return;
    const request = linkRequest(library.live, library.links, checkedPairs.load());
    if (!request) {
      if (saved.length) show(saved);
      else ui.notify('No new likely links. Related notes found later will be checked then.');
      return;
    }
    finding = true;
    try {
      const answer = await tutor.ask(provider, request.prompt, 'light');
      // Checked pairs are not sent again until either note is edited.
      checkedPairs.save(request.pairs);
      remaining = request.remaining;
      const found = parseLinks(answer, request).map(
        ({ from, to }) => [from.id, to.id] as [string, string],
      );
      const all = pendingLinks([...savedPairs, ...found], (id) => library.get(id), library.links);
      store(all);
      if (all.length) show(all);
      else
        ui.notify(
          `No clear links among ${request.pairs.length} likely ${request.pairs.length === 1 ? 'pair' : 'pairs'}.`,
        );
    } catch (e) {
      ui.notify(String(e).replace(/^Error: /, ''));
    } finally {
      finding = false;
    }
  }

  function addLinks() {
    const kept = suggestions?.filter((link) => link.keep) ?? [];
    const bySource = new Map<string, string[]>();
    for (const { from, to } of kept)
      bySource.set(from.id, [...(bySource.get(from.id) || []), to.title]);
    for (const [id, titles] of bySource) {
      const note = library.get(id);
      if (note) library.change(id, { body: withLinks(note.body, titles) });
    }
    // Unticked suggestions were turned down, so none are kept.
    store([]);
    hide();
    ui.notify(`Added ${kept.length} ${kept.length === 1 ? 'link' : 'links'}`);
  }

  const neighbors = $derived.by(() => {
    const near = new Set<number>();
    if (previewPair.length) {
      graph.nodes.forEach((node, i) => previewPair.includes(node.id) && near.add(i));
      return near;
    }
    if (hovered < 0) return near;
    near.add(hovered);
    for (const [a, b] of links) {
      if (a === hovered) near.add(b);
      if (b === hovered) near.add(a);
    }
    return near;
  });

  $effect(() => {
    void shape;
    untrack(() => {
      layout.setGraph(
        graph.nodes.map((node) => node.id),
        graph.edges,
      );
      links = layout.links;
      hovered = -1;
      if (reducedMotion) layout.settle();
      run();
    });
  });

  function run() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame() {
    raf = 0;
    for (let i = 0; i < 2 && !layout.settled; i++) layout.tick();
    positions = layout.nodes.map(({ x, y }) => ({ x, y }));
    if (autoFit) fit();
    if (!layout.settled || drag) run();
  }
  onDestroy(() => cancelAnimationFrame(raf));

  function fit() {
    if (!width || !height) return;
    const { minX, minY, maxX, maxY } = layout.bounds();
    // Leave room around the outermost notes for their labels.
    const padX = Math.min(140, width / 4);
    const padY = Math.min(50, height / 4);
    const k = Math.min(
      2,
      (width - padX * 2) / (maxX - minX || 1),
      (height - padY * 2) / (maxY - minY || 1),
    );
    view = {
      k,
      x: width / 2 - ((minX + maxX) / 2) * k,
      y: height / 2 - ((minY + maxY) / 2) * k,
    };
  }
  function resetView() {
    autoFit = true;
    fit();
  }

  const radius = (node: GraphNode) => 4 + Math.sqrt(graph.degree.get(node.id) || 0) * 2.4;
  const fill = (node: GraphNode) => {
    if (!colorCollections || !node.note) return undefined;
    const top = node.note.collection.split(' / ')[0].trim() || 'Personal';
    return `oklch(0.66 0.13 ${tagHue(top)})`;
  };

  function open(node: GraphNode) {
    if (node.note) void ui.reveal(node.note);
    else if (node.pdf) void ui.openPdf(node.pdf);
  }

  let drag = $state<
    | { kind: 'node'; index: number; x: number; y: number; moved: boolean }
    | { kind: 'pan'; x: number; y: number; viewX: number; viewY: number }
    | null
  >(null);

  function point(event: PointerEvent | WheelEvent) {
    const rect = svg!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function pointerDown(event: PointerEvent, index = -1) {
    if (event.button !== 0) return;
    event.stopPropagation();
    svg?.setPointerCapture(event.pointerId);
    if (index >= 0) {
      layout.nodes[index].fixed = true;
      drag = { kind: 'node', index, x: event.clientX, y: event.clientY, moved: false };
    } else drag = { kind: 'pan', x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
  }
  function pointerMove(event: PointerEvent) {
    if (!drag) return;
    if (drag.kind === 'pan') {
      autoFit = false;
      view = {
        ...view,
        x: drag.viewX + event.clientX - drag.x,
        y: drag.viewY + event.clientY - drag.y,
      };
      return;
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
    drag.moved = true;
    autoFit = false;
    const { x, y } = point(event);
    const node = layout.nodes[drag.index];
    node.x = (x - view.x) / view.k;
    node.y = (y - view.y) / view.k;
    layout.reheat(0.2);
    run();
  }
  function pointerUp() {
    if (drag?.kind === 'node') {
      layout.nodes[drag.index].fixed = false;
      if (!drag.moved) open(graph.nodes[drag.index]);
    }
    drag = null;
  }
  function zoom(event: WheelEvent) {
    event.preventDefault();
    autoFit = false;
    const { x, y } = point(event);
    const k = Math.min(4, Math.max(0.15, view.k * Math.exp(-event.deltaY * 0.0015)));
    view = { k, x: x - ((x - view.x) * k) / view.k, y: y - ((y - view.y) * k) / view.k };
  }
  // Wheel listeners must be active to keep the page from scrolling while zooming.
  $effect(() => {
    const element = svg;
    if (!element) return;
    element.addEventListener('wheel', zoom, { passive: false });
    return () => element.removeEventListener('wheel', zoom);
  });
</script>

<div class="practice-layout">
  <div class="graph-page">
    <header class="page-top" data-tauri-drag-region>
      <button class="text-button" onclick={() => ui.navigate('library')}
        ><ArrowLeft size={15} /> Library</button
      >
      <span class="subtle">{counts}</span>
    </header>
    <div class="graph-controls">
      <label
        ><input
          type="checkbox"
          checked={showUnlinked}
          onchange={(e) => ui.setExpanded('graph:unlinked', e.currentTarget.checked)}
        />Unlinked notes</label
      ><label
        ><input
          type="checkbox"
          checked={colorCollections}
          onchange={(e) => ui.setExpanded('graph:collections', e.currentTarget.checked)}
        />Color by collection</label
      >{#if hasPdfs}<label title="Also turns PDFs on or off in search"
          ><input
            type="checkbox"
            checked={preferences.pdfIndex}
            onchange={(e) => {
              preferences.set({ pdfIndex: e.currentTarget.checked });
              if (preferences.pdfIndex) void attachments.index();
            }}
          />PDFs</label
        >{/if}{#if provider}<button
          class="text-button accent graph-suggest"
          disabled={finding || !!suggestions}
          title={`Ask ${PROVIDER_NAMES[provider]} to link related notes. Only notes without links are read, briefly.`}
          onclick={suggestLinks}
          ><Sparkle size={14} />{finding
            ? `Asking ${PROVIDER_NAMES[provider]}…`
            : 'Suggest links'}{#if saved.length && !finding}<span
              class="graph-suggest-count"
              title={`${saved.length} waiting for review`}>{saved.length}</span
            >{/if}</button
        >{/if}<button
        class="icon-button small"
        aria-label="Fit graph to view"
        title="Fit to view"
        onclick={resetView}><ArrowsIn size={14} /></button
      >
    </div>
    <div class="graph-canvas" bind:clientWidth={width} bind:clientHeight={height}>
      {#if graph.nodes.length}
        <svg
          bind:this={svg}
          role="group"
          aria-label="Note graph"
          class:hovering={hovered >= 0 || previewPair.length > 0}
          class:dragging={drag !== null}
          {width}
          {height}
          onpointerdown={(e) => pointerDown(e)}
          onpointermove={pointerMove}
          onpointerup={pointerUp}
          onpointercancel={pointerUp}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {#each links as [a, b]}
              {#if positions[a] && positions[b]}<line
                  class="graph-link"
                  class:near={hovered >= 0 && (a === hovered || b === hovered)}
                  x1={positions[a].x}
                  y1={positions[a].y}
                  x2={positions[b].x}
                  y2={positions[b].y}
                />{/if}
            {/each}
            {#each graph.nodes as node, i (node.id)}
              {#if positions[i]}
                {@const r = radius(node)}
                <!-- Pointer handling lives on the svg; keyboard opens the note from here. -->
                <g
                  class="graph-node"
                  class:active={!!node.note && node.id === ui.activeId}
                  class:near={neighbors.has(i)}
                  class:graph-pdf={!!node.pdf}
                  role="button"
                  tabindex="0"
                  aria-label={node.pdf ? `${node.pdf} (PDF)` : node.title || 'Untitled note'}
                  transform={`translate(${positions[i].x} ${positions[i].y})`}
                  style:--node-fill={fill(node)}
                  onpointerdown={(e) => pointerDown(e, i)}
                  onpointerenter={() => (hovered = i)}
                  onpointerleave={() => (hovered = -1)}
                  onfocus={() => (hovered = i)}
                  onblur={() => (hovered = -1)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      open(node);
                    }
                  }}
                >
                  {#if node.pdf}<rect
                      x={-r}
                      y={-r}
                      width={r * 2}
                      height={r * 2}
                      rx="2"
                    />{:else}<circle {r} />{/if}
                  {#if view.k >= 0.9 || neighbors.has(i) || r >= 9 || node.id === ui.activeId}<text
                      y={r + 12}>{node.title || 'Untitled note'}</text
                    >{/if}
                </g>
              {/if}
            {/each}
          </g>
        </svg>
        {#if suggestions}
          <section class="link-suggestions" aria-label="Suggested links">
            <h2>
              {suggestions.length} suggested {suggestions.length === 1 ? 'link' : 'links'}
            </h2>
            <ul>
              {#each suggestions as link (link.from.id + link.to.id)}
                <li
                  onpointerenter={() => (previewPair = [link.from.id, link.to.id])}
                  onpointerleave={() => (previewPair = [])}
                >
                  <label title={`${link.from.title} → ${link.to.title}`}
                    ><input type="checkbox" bind:checked={link.keep} /><span>{link.from.title}</span
                    ><ArrowRight size={11} /><span>{link.to.title}</span></label
                  >
                </li>
              {/each}
            </ul>
            <p class="subtle">
              Each link is added to the end of the first note. Unticked links are discarded.{remaining
                ? ` ${remaining} more likely ${remaining === 1 ? 'pair' : 'pairs'} next time.`
                : ''}
            </p>
            <div class="link-suggestions-actions">
              <button class="text-button" title="Keep these suggestions for later" onclick={hide}
                >Not now</button
              ><button
                class="primary-button"
                disabled={!suggestions.some((link) => link.keep)}
                onclick={addLinks}>Add links</button
              >
            </div>
          </section>
        {/if}
        {#if !graph.edges.length && !suggestions}<p class="graph-hint">
            Type [[ in a note to link it to another. Linked notes pull together here.
          </p>{/if}
      {:else}
        <div class="graph-empty">
          <Graph size={40} weight="thin" />
          <p>
            {library.live.length
              ? 'No linked notes yet. Type [[ in a note to link it to another.'
              : 'Your notes and the links between them will appear here.'}
          </p>
        </div>
      {/if}
    </div>
  </div>
</div>
