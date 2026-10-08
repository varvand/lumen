<script lang="ts">
  import { tick } from 'svelte';
  import { Plus } from 'phosphor-svelte';
  import { library } from '../lib/library.svelte';
  import type { Note } from '../lib/types';

  let { note }: { note: Note } = $props();
  let editing = $state(false);
  let draft = $state('');
  let input = $state<HTMLInputElement>();
  let button = $state<HTMLButtonElement>();

  async function edit() {
    draft = note.tags.map((tag) => `#${tag}`).join(' ');
    editing = true;
    await tick();
    input?.focus();
  }

  async function finish(save: boolean, restoreFocus = false) {
    if (!editing) return;
    if (save && draft !== note.tags.map((tag) => `#${tag}`).join(' ')) {
      const tags = [
        ...new Set(
          draft
            .split(/[\s,]+/)
            .map((tag) => tag.replace(/^#+/, ''))
            .filter(Boolean),
        ),
      ];
      if (JSON.stringify(tags) !== JSON.stringify(note.tags)) library.change(note.id, { tags });
    }
    editing = false;
    if (restoreFocus) {
      await tick();
      button?.focus();
    }
  }
</script>

{#if editing}
  <input
    bind:this={input}
    bind:value={draft}
    class="note-tags-input"
    aria-label="Note tags"
    placeholder="#tag1 #tag2 #tag3"
    onblur={() => finish(true)}
    onkeydown={(event) => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        void finish(event.key === 'Enter', true);
      }
    }}
  />
{:else}
  <button
    bind:this={button}
    class="note-tags-button"
    aria-label={note.tags.length ? 'Edit tags' : 'Add tags'}
    title="Edit tags: #tag1 #tag2 #tag3"
    onclick={edit}
  >
    {#each note.tags as tag}<span class="tag">{tag}</span>{/each}
    <span class="add-tags"><Plus size={12} />Add tags</span>
  </button>
{/if}

<style>
  .note-tags-button {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: inherit;
    text-align: left;
  }
  .note-tags-button :global(.tag) {
    overflow-wrap: anywhere;
  }
  .add-tags {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 0;
  }
  .note-tags-button:hover .add-tags {
    color: var(--accent);
  }
  .note-tags-input {
    flex: 1;
    min-width: min(180px, 100%);
    padding: 4px 7px;
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-size: inherit;
  }
</style>
