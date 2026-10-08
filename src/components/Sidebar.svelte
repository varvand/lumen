<script lang="ts">
  import {
    SunHorizon,
    MagnifyingGlass,
    Plus,
    Files,
    Tray,
    Brain,
    FolderSimple,
    GearSix,
    Trash,
    ArrowCircleUp,
    SidebarSimple,
  } from 'phosphor-svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { updates } from '../lib/updates.svelte';

  /** Collapsed, the sidebar is an icon rail; labels move into tooltips. */
  const tip = (label: string) => (ui.sidebarCollapsed ? label : undefined);

  let naming = $state(false);
  let collectionName = $state('');

  /** Name a collection in place; it starts with one blank note, since notes define collections. */
  function startCollection() {
    if (ui.sidebarCollapsed) ui.toggleSidebar();
    collectionName = '';
    naming = true;
  }
  const focus = (node: HTMLInputElement) => node.focus();
  async function createCollection() {
    const name = collectionName.trim();
    naming = false;
    if (!name) return;
    if (library.collections.includes(name)) return ui.browse('library', name);
    const note = await ui.createNote({ collection: name });
    if (note) await ui.browse('library', name);
  }
</script>

<aside class="sidebar" aria-label="Main navigation" data-tauri-drag-region>
  <div class="sidebar-header" data-tauri-drag-region>
    <button class="brand" title={tip('All notes')} onclick={() => ui.browse('library')}
      ><span class="brand-mark"><SunHorizon size={27} weight="regular" /></span><span
        class="brand-name">lumen<span class="brand-period">.</span></span
      ></button
    ><button
      class="icon-button sidebar-toggle"
      aria-label={ui.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-expanded={!ui.sidebarCollapsed}
      title={`${ui.sidebarCollapsed ? 'Expand' : 'Collapse'} sidebar (⌃⌘S)`}
      onclick={() => ui.toggleSidebar()}><SidebarSimple size={18} /></button
    >
  </div>
  <button class="search-trigger" title={tip('Find a note (⌘K)')} onclick={() => ui.open('search')}
    ><MagnifyingGlass size={16} /><span>Find a note</span><kbd>⌘ K</kbd></button
  >
  <nav class="main-nav">
    <button
      class:active={ui.screen === 'library' && !ui.collection}
      title={tip('All notes')}
      onclick={() => ui.browse('library')}
      ><Files size={19} /><span>All notes</span><span class="nav-count">{library.libraryCount}</span
      ></button
    >
    <button
      class:active={ui.screen === 'inbox'}
      title={tip('Inbox')}
      onclick={() => ui.browse('inbox')}
      ><Tray size={19} /><span>Inbox</span>{#if library.inboxCount}<span class="nav-count"
          >{library.inboxCount}</span
        >{/if}</button
    >
    <button
      class:active={ui.screen === 'practice'}
      title={tip('Practice')}
      onclick={() => ui.navigate('practice')}
      ><Brain size={19} /><span>Practice</span>{#if library.due.length}<span
          class="nav-count accent-count">{library.due.length}</span
        >{/if}</button
    >
  </nav>
  <div class="collection-heading">
    <span>COLLECTIONS</span><button
      class="icon-button small"
      title="New collection"
      aria-label="New collection"
      onclick={startCollection}><Plus size={14} /></button
    >
  </div>
  <nav class="collection-nav" aria-label="Collections">
    {#if naming}<label class="collection-name"
        ><FolderSimple size={17} /><input
          use:focus
          aria-label="Collection name"
          placeholder="Collection name"
          maxlength="80"
          bind:value={collectionName}
          onkeydown={(e) => {
            if (e.key === 'Enter') void createCollection();
            if (e.key === 'Escape') naming = false;
          }}
          onblur={() => (naming = false)}
        /></label
      >{/if}
    {#each library.collections as item}<button
        class:active={ui.collection === item && ui.screen === 'library'}
        title={tip(item)}
        onclick={() => ui.browse('library', item)}
        ><FolderSimple size={17} /><span>{item}</span></button
      >{/each}
  </nav>
  <div class="sidebar-bottom">
    {#if updates.available}<button
        class="update-button"
        disabled={updates.status === 'downloading' || updates.status === 'installing'}
        title={updates.error || `Install Lumen ${updates.available.version} and relaunch`}
        onclick={() => updates.install()}
        ><ArrowCircleUp size={17} /><span
          >{updates.status === 'downloading'
            ? `Downloading${updates.progress === null ? '…' : ` ${Math.round(updates.progress * 100)}%`}`
            : updates.status === 'installing'
              ? 'Installing…'
              : updates.status === 'error'
                ? 'Update failed · retry'
                : 'Update available'}</span
        ></button
      >{/if}
    <div class="sidebar-tools">
      <button
        class:active={ui.screen === 'trash'}
        class="text-button"
        title={tip('Trash')}
        onclick={() => ui.browse('trash')}><Trash size={16} /><span>Trash</span></button
      ><button
        class="icon-button"
        aria-label="Settings"
        title="Settings"
        onclick={() => ui.open('settings')}><GearSix size={19} /></button
      >
    </div>
  </div>
</aside>
