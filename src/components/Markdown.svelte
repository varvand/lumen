<script lang="ts">
  import { renderMarkdown } from '../lib/markdown';
  import { native } from '../lib/storage';
  let { value, compact = false }: { value: string; compact?: boolean } = $props();
  let html = $derived(renderMarkdown(value));
  async function followLink(event: MouseEvent) {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return;
    event.preventDefault();
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
<div class:compact class="prose" onclick={followLink}>{@html html}</div>
