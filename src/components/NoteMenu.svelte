<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowCounterClockwise,
    CaretRight,
    Check,
    DownloadSimple,
    FolderSimple,
    PushPin,
    PushPinSlash,
    Trash,
  } from 'phosphor-svelte';
  import type { Note } from '../lib/types';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { collectionPath, type CollectionFolder } from '../lib/collections';

  let {
    note,
    x,
    y,
    trigger,
    onclose,
  }: { note: Note; x: number; y: number; trigger: HTMLElement; onclose: () => void } = $props();

  const margin = 8;
  let menu: HTMLDivElement;
  let moveItem = $state<HTMLButtonElement>();
  let submenu = $state<HTMLDivElement>();
  let moving = $state(false);

  const current = $derived(note.inbox ? '' : collectionPath(note.collection));
  const targets = $derived(flatten(library.folders));

  function flatten(folders: CollectionFolder[], depth = 0): { path: string; depth: number }[] {
    return folders.flatMap((folder) => [
      { path: folder.path, depth },
      ...flatten(folder.children, depth + 1),
    ]);
  }

  function items(container: HTMLElement | undefined) {
    return [...(container?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
  }

  // Props are gone once the menu unmounts, so read them before closing.
  function close(restoreFocus = true) {
    const row = trigger;
    onclose();
    if (restoreFocus) row.focus();
  }

  function run(action: () => unknown) {
    const pending = action();
    close();
    void pending;
  }

  function openSubmenu(focus: boolean) {
    moving = true;
    if (focus) queueMicrotask(() => items(submenu)[0]?.focus());
  }

  function closeSubmenu() {
    moving = false;
    moveItem?.focus();
  }

  // Keep menus outside the scrolling note list, on the themed app shell.
  function portal(element: HTMLElement) {
    (trigger.closest('.app-shell') ?? document.body).appendChild(element);
    return { destroy: () => element.remove() };
  }

  function place(element: HTMLDivElement) {
    const { offsetWidth: width, offsetHeight: height } = element;
    element.style.left = `${Math.max(margin, Math.min(x, innerWidth - width - margin))}px`;
    element.style.top = `${Math.max(margin, Math.min(y, innerHeight - height - margin))}px`;
  }

  // Open the submenu beside the "Move to" item, flipping left when there is no room.
  function placeSubmenu(element: HTMLDivElement) {
    const parent = menu.getBoundingClientRect();
    const row = moveItem!.getBoundingClientRect();
    element.style.maxHeight = `${innerHeight - margin * 2}px`;
    const width = element.offsetWidth;
    const right = parent.right - 4;
    element.style.left = `${right + width + margin <= innerWidth ? right : Math.max(margin, parent.left - width + 4)}px`;
    element.style.top = `${Math.max(margin, Math.min(row.top - 6, innerHeight - element.offsetHeight - margin))}px`;
  }

  function keydown(event: KeyboardEvent) {
    const inSubmenu = !!submenu?.contains(event.target as Node);
    const list = items(inSubmenu ? submenu : menu);
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => list[(next + list.length) % list.length]?.focus();
    event.stopPropagation();
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index < 0 ? -1 : index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(-1);
    else if (event.key === 'ArrowRight' && document.activeElement === moveItem) openSubmenu(true);
    else if ((event.key === 'ArrowLeft' || event.key === 'Escape') && inSubmenu) closeSubmenu();
    else if (event.key === 'Escape') close();
    else if (event.key === 'Tab') close(false);
    else return;
    event.preventDefault();
  }

  onMount(() => {
    place(menu);
    items(menu)[0]?.focus();
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!menu.contains(target) && !submenu?.contains(target)) close(false);
    };
    const dismiss = (event: Event) => {
      if (!submenu?.contains(event.target as Node)) close(false);
    };
    const blur = () => close(false);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', dismiss, true);
    addEventListener('resize', blur);
    addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', dismiss, true);
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
  aria-label="Note actions"
  bind:this={menu}
  use:portal
  onkeydown={keydown}
  oncontextmenu={(e) => e.preventDefault()}
>
  {#if note.trashed}
    <button role="menuitem" onclick={() => run(() => ui.setTrashed(note, false))}
      ><ArrowCounterClockwise size={15} />Restore note</button
    >
  {:else}
    <button
      role="menuitem"
      onpointerenter={() => (moving = false)}
      onclick={() => run(() => library.change(note.id, { pinned: !note.pinned }))}
      >{#if note.pinned}<PushPinSlash size={15} />Unpin note{:else}<PushPin size={15} />Pin note{/if}</button
    ><button
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={moving}
      bind:this={moveItem}
      onpointerenter={() => openSubmenu(false)}
      onclick={() => openSubmenu(true)}
      ><FolderSimple size={15} />Move to collection<CaretRight
        size={12}
        class="menu-caret"
      /></button
    ><button
      role="menuitem"
      onpointerenter={() => (moving = false)}
      onclick={() => run(() => ui.exportNote(note))}
      ><DownloadSimple size={15} />Export Markdown</button
    >
    <hr />
    <button
      role="menuitem"
      class="danger"
      onpointerenter={() => (moving = false)}
      onclick={() => run(() => ui.setTrashed(note, true))}><Trash size={15} />Move to Trash</button
    >
  {/if}
</div>

{#if moving}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="menu context-menu collection-menu"
    role="menu"
    tabindex="-1"
    aria-label="Move to collection"
    bind:this={submenu}
    use:portal
    use:placeSubmenu
    onkeydown={keydown}
    oncontextmenu={(e) => e.preventDefault()}
  >
    {#each targets as target (target.path)}
      {@const here = target.path === current}
      <button
        role="menuitemradio"
        aria-checked={here}
        style:--depth={target.depth}
        onclick={() => run(() => !here && ui.moveNote(note, target.path))}
        ><span>{target.path.split(' / ').pop()}</span>{#if here}<Check size={13} />{/if}</button
      >
    {:else}
      <p class="menu-empty">No collections yet</p>
    {/each}
  </div>
{/if}
