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
  } from 'phosphor-svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { native } from '../lib/storage';
  import { updates } from '../lib/updates.svelte';

  async function newCollection() {
    const note = await ui.createNote({ collection: 'New collection' });
    if (note) {
      ui.panel = true;
      ui.notify('Rename the collection in the note’s Details panel');
    }
  }
</script>

<aside class="sidebar" aria-label="Main navigation">
  <button class="brand" onclick={() => ui.navigate('library')}
    ><span class="brand-mark"><SunHorizon size={27} weight="regular" /></span><span
      >lumen<span class="brand-period">.</span></span
    ></button
  >
  <button class="search-trigger" onclick={() => ui.open('search')}
    ><MagnifyingGlass size={16} /><span>Find a note</span><kbd>⌘ K</kbd></button
  >
  <nav class="main-nav">
    <button
      class:active={ui.screen === 'library' && !ui.collection}
      onclick={() => ui.navigate('library')}
      ><Files size={19} /><span>All notes</span><span class="nav-count">{library.libraryCount}</span
      ></button
    >
    <button class:active={ui.screen === 'inbox'} onclick={() => ui.navigate('inbox')}
      ><Tray size={19} /><span>Inbox</span>{#if library.inboxCount}<span class="nav-count"
          >{library.inboxCount}</span
        >{/if}</button
    >
    <button class:active={ui.screen === 'practice'} onclick={() => ui.navigate('practice')}
      ><Brain size={19} /><span>Practice</span>{#if library.due.length}<span
          class="nav-count accent-count">{library.due.length}</span
        >{/if}</button
    >
  </nav>
  <div class="collection-heading">
    <span>COLLECTIONS</span><button
      class="icon-button small"
      title="Create a note in a new collection"
      aria-label="New collection"
      onclick={newCollection}><Plus size={14} /></button
    >
  </div>
  <nav class="collection-nav" aria-label="Collections">
    {#each library.collections as item}<button
        class:active={ui.collection === item && ui.screen === 'library'}
        onclick={() => ui.navigate('library', item)}
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
    <button class="capture-button" onclick={() => ui.open('capture')}
      ><Plus size={17} /><span>Capture an idea</span></button
    >
    <div class="sidebar-tools">
      <button
        class:active={ui.screen === 'trash'}
        class="text-button"
        onclick={() => ui.navigate('trash')}><Trash size={16} /> Trash</button
      ><button
        class="icon-button"
        aria-label="Settings"
        title="Settings"
        onclick={() => ui.open('settings')}><GearSix size={19} /></button
      >
    </div>
    <div class="local-status">
      <span class="status-dot"></span>{native
        ? 'Saved on this device'
        : 'Browser preview · local storage'}
    </div>
  </div>
</aside>
