<script lang="ts">
  import { onMount } from 'svelte';
  import { FolderPlus, PencilSimple, Trash } from 'phosphor-svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { inCollection } from '../lib/collections';

  let {
    path,
    x,
    y,
    trigger,
    onsubfolder,
    onrename,
    onclose,
  }: {
    path: string;
    x: number;
    y: number;
    trigger: HTMLElement;
    onsubfolder: () => void;
    onrename: () => void;
    onclose: () => void;
  } = $props();

  const margin = 8;
  let menu: HTMLDivElement;
  /** Deleting trashes every note inside, so it takes a second click to confirm. */
  let confirming = $state(false);
  const count = $derived(
    library.live.filter((n) => !n.inbox && inCollection(n.collection, path)).length,
  );

  function items() {
    return [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }

  // Props are gone once the menu unmounts, so read them before closing.
  function close(restoreFocus = true) {
    const row = trigger;
    onclose();
    if (restoreFocus) row.focus();
  }

  function run(action: () => unknown) {
    const pending = action();
    close(false);
    void pending;
  }

  function portal(element: HTMLElement) {
    (trigger.closest('.app-shell') ?? document.body).appendChild(element);
    return { destroy: () => element.remove() };
  }

  function keydown(event: KeyboardEvent) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => list[(next + list.length) % list.length]?.focus();
    event.stopPropagation();
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index < 0 ? -1 : index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(-1);
    else if (event.key === 'Escape') close();
    else if (event.key === 'Tab') close(false);
    else return;
    event.preventDefault();
  }

  onMount(() => {
    const { offsetWidth: width, offsetHeight: height } = menu;
    menu.style.left = `${Math.max(margin, Math.min(x, innerWidth - width - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(y, innerHeight - height - margin))}px`;
    items()[0]?.focus();
    const outside = (event: Event) => {
      if (!menu.contains(event.target as Node)) close(false);
    };
    const blur = () => close(false);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', blur, true);
    addEventListener('resize', blur);
    addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', blur, true);
      removeEventListener('resize', blur);
      removeEventListener('blur', blur);
    };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="menu context-menu"
  role="menu"
  tabindex="-1"
  aria-label="Collection actions"
  bind:this={menu}
  use:portal
  onkeydown={keydown}
  oncontextmenu={(e) => e.preventDefault()}
>
  <button role="menuitem" onclick={() => run(onsubfolder)}
    ><FolderPlus size={15} />New subfolder</button
  ><button role="menuitem" onclick={() => run(onrename)}><PencilSimple size={15} />Rename</button>
  <hr />
  <button
    role="menuitem"
    class="danger"
    onclick={() => (confirming ? run(() => ui.deleteCollection(path)) : (confirming = true))}
    ><Trash size={15} />{confirming
      ? `Trash ${count} ${count === 1 ? 'note' : 'notes'}?`
      : 'Delete collection'}</button
  >
</div>
