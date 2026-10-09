<script lang="ts">
  import type { PDFDocumentProxy, RenderTask, TextLayer } from 'pdfjs-dist';
  import { pdfjs } from '../lib/pdfjs';

  /** One PDF page: a canvas, with a transparent text layer on top for selecting text. */
  let { doc, number, scale }: { doc: PDFDocumentProxy; number: number; scale: number } = $props();
  let canvas = $state<HTMLCanvasElement>();
  let text = $state<HTMLDivElement>();

  $effect(() => {
    const target = canvas;
    const layerRoot = text;
    const size = scale;
    if (!target || !layerRoot) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    let layer: TextLayer | undefined;
    void (async () => {
      const lib = await pdfjs();
      const page = await doc.getPage(number);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: size });
      const ratio = window.devicePixelRatio || 1;
      target.width = Math.floor(viewport.width * ratio);
      target.height = Math.floor(viewport.height * ratio);
      task = page.render({
        canvas: target,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await task.promise;
      if (cancelled) return;
      layerRoot.replaceChildren();
      layer = new lib.TextLayer({
        textContentSource: page.streamTextContent(),
        container: layerRoot,
        viewport,
      });
      await layer.render();
    })().catch(() => {
      /* A page that fails to draw stays blank; the rest of the PDF still works. */
    });
    return () => {
      cancelled = true;
      task?.cancel();
      layer?.cancel();
    };
  });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>
<div class="textLayer" bind:this={text}></div>
