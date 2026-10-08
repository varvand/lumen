<script lang="ts">
  import { MagnifyingGlass, FileText, ArrowUpRight } from 'phosphor-svelte';
  import Modal from '../Modal.svelte';
  import { library } from '../../lib/library.svelte';
  import { ui } from '../../lib/ui.svelte';
  import { excerpt } from '../../lib/markdown';
  import type { Note } from '../../lib/types';

  let searchText = $state('');
  const results = $derived.by(() => {
    const query = searchText.toLowerCase();
    return library.live
      .filter(
        (n) => !query || `${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase().includes(query),
      )
      .slice(0, 12);
  });
  async function open(note: Note) {
    await ui.reveal(note);
    ui.close();
  }
</script>

<Modal title="Find a note" onclose={() => ui.close()}
  ><div class="command-search">
    <MagnifyingGlass size={21} /><!-- svelte-ignore a11y_autofocus --><input
      autofocus
      aria-label="Search your library"
      placeholder="Search ideas, words, or tags…"
      bind:value={searchText}
    />
  </div>
  <div class="search-results">
    {#each results as note}<button onclick={() => open(note)}
        ><FileText size={19} /><span
          ><strong>{note.title}</strong><small
            >{note.collection} · {excerpt(note.body).slice(0, 65)}</small
          ></span
        ><ArrowUpRight size={16} /></button
      >{/each}{#if !results.length}<p class="helper">No notes match that search.</p>{/if}
  </div></Modal
>
