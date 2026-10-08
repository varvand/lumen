<script lang="ts">
  import {
    MagnifyingGlass,
    Plus,
    Brain,
    FileText,
    PushPin,
    X,
    ArrowLineLeft,
    TrayArrowDown,
  } from 'phosphor-svelte';
  import Select from './Select.svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { excerpt } from '../lib/markdown';
  import { dateLabel } from '../lib/format';

  const empty = $derived(
    ui.query
      ? { title: 'No matching notes', hint: 'Try another word or phrase.' }
      : ui.screen === 'inbox'
        ? { title: 'A clear inbox', hint: 'Captured ideas will arrive here.' }
        : ui.screen === 'trash'
          ? { title: 'Nothing in Trash', hint: 'Removed notes can be restored here.' }
          : { title: 'Room for an idea', hint: 'Create a note to get started.' },
  );
</script>

<section class="note-list" aria-label="Note library">
  <div class="list-title" data-tauri-drag-region>
    <h1 data-tauri-drag-region>{ui.title}</h1>
    <span class="list-count" data-tauri-drag-region
      >{ui.visibleNotes.length} {ui.visibleNotes.length === 1 ? 'note' : 'notes'}</span
    >
    <div class="list-title-actions">
      <button
        class="icon-button"
        aria-label="New note"
        title="New note (⌘ N)"
        onclick={() => ui.createNote()}><Plus size={20} /></button
      ><button
        class="icon-button"
        aria-label="Capture an idea"
        title="Capture an idea or import Markdown"
        onclick={() => ui.open('capture')}><TrayArrowDown size={19} /></button
      ><button
        class="icon-button list-toggle"
        aria-label="Hide note list"
        title="Hide note list (⌃⌘L)"
        onclick={() => ui.toggleList(true)}><ArrowLineLeft size={18} /></button
      >
    </div>
  </div>
  <div class="list-controls">
    <label class="list-search"
      ><MagnifyingGlass size={14} /><input
        aria-label="Filter notes"
        placeholder="Filter"
        bind:value={ui.query}
      />{#if ui.query}<button
          class="icon-button small"
          aria-label="Clear filter"
          onclick={() => (ui.query = '')}><X size={12} /></button
        >{/if}</label
    >
    <div class="sort-control" title="Sort notes">
      <Select
        label="Sort notes"
        compact
        bind:value={ui.sort}
        options={[
          { value: 'updated', label: 'Last edited' },
          { value: 'title', label: 'Title' },
        ]}
      />
    </div>
  </div>
  <div class="note-list-scroll">
    {#if library.loading}<div class="skeleton-note"></div>
      <div class="skeleton-note"></div>
      <div class="skeleton-note"></div>
    {:else if !ui.visibleNotes.length}<div class="list-empty">
        <FileText size={27} weight="light" /><strong>{empty.title}</strong>
        <p>{empty.hint}</p>
        {#if !ui.query && ui.screen === 'library'}<button
            class="text-button accent"
            onclick={() => ui.createNote()}>Create a note <Plus size={14} /></button
          >{:else if !ui.query && ui.screen === 'inbox'}<button
            class="text-button accent"
            onclick={() => ui.open('capture')}>Capture an idea <TrayArrowDown size={14} /></button
          >{/if}
      </div>
    {:else}{#each ui.visibleNotes as note (note.id)}
        <button
          class="note-item"
          class:selected={note.id === ui.activeId}
          onclick={() => ui.select(note.id)}
        >
          <div class="note-item-top">
            {#if !ui.collection}<span class="note-collection">{note.collection || 'Unsorted'}</span
              >{/if}{#if note.pinned}<PushPin size={12} weight="fill" />{:else}<span
                >{dateLabel(note.updatedAt)}</span
              >{/if}
          </div>
          <h2>{note.title || 'Untitled note'}</h2>
          <p>{excerpt(note.body) || 'A fresh page. Start writing…'}</p>
          <div class="note-item-bottom">
            {#if note.tags[0]}<span class="list-tag"># {note.tags[0]}</span
              >{/if}{#if note.intent !== 'reference'}<span class="learning-indicator"
                ><Brain size={12} />{note.prompts.length}</span
              >{/if}
          </div>
        </button>
      {/each}{/if}
  </div>
</section>
