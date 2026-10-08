<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { ArrowLeft, ArrowsIn, Graph } from 'phosphor-svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { GraphLayout } from '../lib/graphLayout';
  import { tagHue } from '../lib/format';
  import type { Note } from '../lib/types';

  const layout = new GraphLayout();
  const showUnlinked = $derived(ui.isExpanded('graph:unlinked', true));
  const colorCollections = $derived(ui.isExpanded('graph:collections', false));

  const graph = $derived.by(() => {
    const degree = new Map<string, number>();
    for (const [from, to] of library.links.edges) {
      degree.set(from, (degree.get(from) || 0) + 1);
      degree.set(to, (degree.get(to) || 0) + 1);
    }
    const notes = library.live.filter((note) => showUnlinked || degree.has(note.id));
    const ids = new Set(notes.map((note) => note.id));
    const edges = library.links.edges.filter(([from, to]) => ids.has(from) && ids.has(to));
    return { notes, edges, degree };
  });
  /** Changes only when notes or links are added or removed, not on every keystroke. */
  const shape = $derived(
    graph.notes.map((note) => note.id).join('\n') + '\n\n' + graph.edges.join('\n'),
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

  const neighbors = $derived.by(() => {
    const near = new Set<number>();
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
        graph.notes.map((note) => note.id),
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

  const radius = (note: Note) => 4 + Math.sqrt(graph.degree.get(note.id) || 0) * 2.4;
  const fill = (note: Note) => {
    if (!colorCollections) return undefined;
    const top = note.collection.split(' / ')[0].trim() || 'Personal';
    return `oklch(0.66 0.13 ${tagHue(top)})`;
  };

  function open(note: Note) {
    void ui.reveal(note);
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
      if (!drag.moved) open(graph.notes[drag.index]);
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
      <span class="subtle"
        >{graph.notes.length}
        {graph.notes.length === 1 ? 'note' : 'notes'} · {graph.edges.length}
        {graph.edges.length === 1 ? 'link' : 'links'}</span
      >
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
      ><button
        class="icon-button small"
        aria-label="Fit graph to view"
        title="Fit to view"
        onclick={resetView}><ArrowsIn size={14} /></button
      >
    </div>
    <div class="graph-canvas" bind:clientWidth={width} bind:clientHeight={height}>
      {#if graph.notes.length}
        <svg
          bind:this={svg}
          role="group"
          aria-label="Note graph"
          class:hovering={hovered >= 0}
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
            {#each graph.notes as note, i (note.id)}
              {#if positions[i]}
                {@const r = radius(note)}
                <!-- Pointer handling lives on the svg; keyboard opens the note from here. -->
                <g
                  class="graph-node"
                  class:active={note.id === ui.activeId}
                  class:near={neighbors.has(i)}
                  role="button"
                  tabindex="0"
                  aria-label={note.title || 'Untitled note'}
                  transform={`translate(${positions[i].x} ${positions[i].y})`}
                  style:--node-fill={fill(note)}
                  onpointerdown={(e) => pointerDown(e, i)}
                  onpointerenter={() => (hovered = i)}
                  onpointerleave={() => (hovered = -1)}
                  onfocus={() => (hovered = i)}
                  onblur={() => (hovered = -1)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      open(note);
                    }
                  }}
                >
                  <circle {r} />
                  {#if view.k >= 0.9 || neighbors.has(i) || r >= 9 || note.id === ui.activeId}<text
                      y={r + 12}>{note.title || 'Untitled note'}</text
                    >{/if}
                </g>
              {/if}
            {/each}
          </g>
        </svg>
        {#if !graph.edges.length}<p class="graph-hint">
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
