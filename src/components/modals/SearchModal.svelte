<script lang="ts">
  import { MagnifyingGlass, FileText, FilePdf, ArrowUpRight } from 'phosphor-svelte';
  import Modal from '../Modal.svelte';
  import { library } from '../../lib/library.svelte';
  import { ui } from '../../lib/ui.svelte';
  import { excerpt } from '../../lib/markdown';
  import type { Note } from '../../lib/types';
  import { attachments } from '../../lib/attachments.svelte';
  import { preferences } from '../../lib/preferences.svelte';
  import { searchPdfs, type PdfMatch } from '../../lib/pdf';

  let searchText = $state('');
  const results = $derived.by(() => {
    const query = searchText.toLowerCase();
    return library.live
      .filter(
        (n) => !query || `${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase().includes(query),
      )
      .slice(0, 12);
  });
  /** Pages of PDFs whose text or file name matches, when PDFs are included in search. */
  const pages = $derived.by((): PdfMatch[] => {
    if (!preferences.pdfIndex || !attachments.enabled) return [];
    const query = searchText.trim().toLowerCase();
    if (query.length < 2) return [];
    const named = attachments.list
      .filter((pdf) => pdf.name.toLowerCase().includes(query))
      .map((pdf) => ({ name: pdf.name, page: 1, snippet: 'PDF in your library' }));
    const inside = searchPdfs(attachments.texts, query).filter(
      (m) => !named.some((n) => n.name === m.name && m.page === 1),
    );
    return [...named, ...inside].slice(0, 8);
  });
  async function open(note: Note) {
    await ui.reveal(note);
    ui.close();
  }
  async function openPage(match: PdfMatch) {
    ui.close();
    await ui.openPdf(match.name, match.page);
  }
</script>

<Modal title="Find a note" onclose={() => ui.close()}
  ><div class="command-search">
    <MagnifyingGlass size={21} /><!-- svelte-ignore a11y_autofocus --><input
      autofocus
      aria-label="Search your library"
      placeholder="Search ideas, words, or tags…"
      bind:value={searchText}
      onkeydown={(e) => {
        if (e.key !== 'Enter') return;
        if (results[0]) void open(results[0]);
        else if (pages[0]) void openPage(pages[0]);
      }}
    />
  </div>
  <div class="search-results">
    {#each results as note}<button onclick={() => open(note)}
        ><FileText size={19} /><span
          ><strong>{note.title}</strong><small
            >{note.collection} · {excerpt(note.body).slice(0, 65)}</small
          ></span
        ><ArrowUpRight size={16} /></button
      >{/each}{#if !results.length && !pages.length}<p class="helper">
        No notes match that search.
      </p>{/if}
    {#if pages.length}<h4 class="search-group">In PDFs</h4>
      {#each pages as match (match.name + match.page)}<button onclick={() => openPage(match)}
          ><FilePdf size={19} /><span
            ><strong>{match.name} · p. {match.page}</strong><small>{match.snippet}</small></span
          ><ArrowUpRight size={16} /></button
        >{/each}{/if}
    {#if preferences.pdfIndex && attachments.indexing}<p class="helper" role="status">
        Reading {attachments.indexing}…
      </p>{/if}
  </div></Modal
>
