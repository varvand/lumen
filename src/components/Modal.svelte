<script lang="ts">
  import { onMount } from 'svelte';
  import { X } from 'phosphor-svelte';
  import type { Snippet } from 'svelte';
  let {
    title,
    onclose,
    children,
    wide = false,
  }: { title: string; onclose: () => void; children: Snippet; wide?: boolean } = $props();
  let dialog: HTMLDialogElement;
  // Closing on unmount queues a close event that arrives after the next dialog has opened;
  // it must not close that one.
  let unmounted = false;
  onMount(() => {
    dialog.showModal();
    return () => {
      unmounted = true;
      dialog.close();
    };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  class:wide
  onclose={() => {
    if (!unmounted) onclose();
  }}
  onclick={(e) => {
    if (e.target === dialog) onclose();
  }}
  aria-label={title}
>
  <div class="modal-header">
    <h2>{title}</h2>
    <button class="icon-button" aria-label="Close dialog" onclick={onclose}><X size={18} /></button>
  </div>
  <div class="modal-content">{@render children()}</div>
</dialog>
