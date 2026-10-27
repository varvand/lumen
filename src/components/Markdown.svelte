<script lang="ts">
  import { renderMarkdown } from '../lib/markdown';
  import { library } from '../lib/library.svelte';
  import { preferences } from '../lib/preferences.svelte';
  import { ui } from '../lib/ui.svelte';
  import { native } from '../lib/storage';
  import { attachments } from '../lib/attachments.svelte';
  import { isDiagramLanguage, mountDiagram } from '../lib/flowchart';
  let { value, compact = false }: { value: string; compact?: boolean } = $props();
  let html = $derived(
    renderMarkdown(value, (key) => library.titles.has(key) || attachments.byKey.has(key)),
  );
  let root: HTMLDivElement | undefined;
  // Diagrams are drawn after the text, so notes with none never load the diagram library.
  // They are drawn again when the theme changes, to take its colors.
  $effect(() => {
    html;
    preferences.active;
    for (const code of root?.querySelectorAll('pre > code[class*="language-"]') ?? []) {
      const info = [...code.classList].find((c) => c.startsWith('language-'))?.slice(9);
      if (!isDiagramLanguage(info)) continue;
      const figure = document.createElement('div');
      figure.className = 'diagram';
      figure.dataset.source = code.textContent ?? '';
      code.parentElement!.replaceWith(figure);
    }
    for (const figure of root?.querySelectorAll<HTMLElement>('.diagram') ?? [])
      void mountDiagram(figure, figure.dataset.source ?? '');
  });
  async function followLink(event: MouseEvent) {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return;
    event.preventDefault();
    const target = anchor.dataset.wikilink;
    if (target) return ui.openLink(target);
    const url = anchor.getAttribute('href');
    if (!url || !/^https?:\/\//i.test(url)) return;
    if (native) {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } else window.open(url, '_blank', 'noopener,noreferrer');
  }
</script>

<!-- Anchor elements in the rendered document provide keyboard activation. -->
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div bind:this={root} class:compact class="prose" onclick={followLink}>{@html html}</div>
