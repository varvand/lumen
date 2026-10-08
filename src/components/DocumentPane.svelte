<script lang="ts">
  import {
    SunHorizon,
    Plus,
    Tray,
    Brain,
    ArrowUpRight,
    ArrowCounterClockwise,
    DownloadSimple,
    SidebarSimple,
    ArrowsOutSimple,
    ArrowsInSimple,
    ArrowLineRight,
    PushPin,
    X,
    Trash,
    BookOpen,
    PencilSimple,
    Columns,
    WarningCircle,
    DotsThree,
  } from 'phosphor-svelte';
  import Editor from './Editor.svelte';
  import Markdown from './Markdown.svelte';
  import FormatToolbar from './FormatToolbar.svelte';
  import DetailsPanel from './DetailsPanel.svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { words } from '../lib/markdown';
  import { dateLabel } from '../lib/format';

  let editor = $state<Editor>();
  let titleField = $state<HTMLTextAreaElement>();
  const active = $derived(ui.active);
  const totalWords = $derived(active ? words(active.body) : 0);
  let menuOpen = $state(false);

  /** Run a menu action, then close the menu. */
  function run(action: () => unknown) {
    menuOpen = false;
    void action();
  }

  // Grow the title field with its content, and again when its width changes.
  $effect(() => {
    active?.title;
    if (!titleField) return;
    const element = titleField;
    const size = () => {
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    };
    size();
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth;
        size();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  });
</script>

<svelte:window
  onclick={() => (menuOpen = false)}
  onkeydown={(e) => {
    if (e.key === 'Escape') menuOpen = false;
  }}
/>

<main class="document-workspace">
  <header class="document-toolbar" data-tauri-drag-region>
    <div class="breadcrumbs" data-tauri-drag-region>
      <button
        class="icon-button nav-toggle"
        aria-label="Toggle navigation"
        onclick={() => (ui.mobileNav = !ui.mobileNav)}><SidebarSimple size={18} /></button
      >{#if ui.listCollapsed && !ui.focus}<button
          class="icon-button list-toggle"
          aria-label="Show note list"
          title="Show note list (⌃⌘L)"
          onclick={() => ui.toggleList(false)}><ArrowLineRight size={18} /></button
        >{/if}{#if ui.focus}<button
          class="icon-button"
          aria-label="Exit focus mode"
          onclick={() => (ui.focus = false)}><ArrowsInSimple size={18} /></button
        >{/if}<span>{active?.collection || 'Library'}</span>{#if active && library.saving}<span
          class="save-state"><span class="status-dot"></span>Saving…</span
        >{:else if active && library.isDirty(active.id)}<span class="save-state"
          >Unsaved changes</span
        >{/if}
    </div>
    <div class="toolbar-actions">
      {#if active}<div class="editor-tabs" role="group" aria-label="Editor view">
          <button
            class:chosen={ui.mode === 'write'}
            aria-pressed={ui.mode === 'write'}
            title="Write"
            onclick={() => (ui.mode = 'write')}><PencilSimple size={14} /><span>Write</span></button
          ><button
            class:chosen={ui.mode === 'split'}
            aria-pressed={ui.mode === 'split'}
            title="Split"
            onclick={() => (ui.mode = 'split')}><Columns size={14} /><span>Split</span></button
          ><button
            class:chosen={ui.mode === 'read'}
            aria-pressed={ui.mode === 'read'}
            title="Read"
            onclick={() => (ui.mode = 'read')}><BookOpen size={14} /><span>Read</span></button
          >
        </div>
        <div class="menu-anchor">
          <button
            class="icon-button"
            class:pressed={menuOpen}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="More actions"
            onclick={(e) => {
              e.stopPropagation();
              menuOpen = !menuOpen;
            }}><DotsThree size={20} weight="bold" /></button
          >{#if menuOpen}<div class="menu" role="menu">
              <button
                role="menuitem"
                onclick={() => run(() => ui.change({ pinned: !active.pinned }))}
                ><PushPin size={15} />{active.pinned ? 'Unpin note' : 'Pin note'}</button
              ><button role="menuitem" onclick={() => run(() => ui.exportActive())}
                ><DownloadSimple size={15} />Export Markdown</button
              ><button role="menuitem" onclick={() => run(() => (ui.focus = !ui.focus))}
                >{#if ui.focus}<ArrowsInSimple size={15} />Exit focus mode{:else}<ArrowsOutSimple
                    size={15}
                  />Focus mode{/if}<kbd>⌘⇧F</kbd></button
              >
              <hr />
              <button
                role="menuitem"
                class:danger={!active.trashed}
                onclick={() => run(() => ui.toggleTrash())}
                >{#if active.trashed}<ArrowCounterClockwise size={15} />Restore note{:else}<Trash
                    size={15}
                  />Move to Trash{/if}</button
              >
            </div>{/if}
        </div>
        <button
          class="icon-button"
          class:pressed={ui.panel}
          aria-label="Toggle note details"
          title="Note details & learning"
          onclick={() => (ui.panel = !ui.panel)}><SidebarSimple size={19} /></button
        >{/if}
    </div>
  </header>
  {#if library.error}<div role="alert" class="error-banner">
      <WarningCircle size={18} /><span>{library.error}</span
      >{#if active && library.isDirty(active.id)}<button
          class="text-button"
          onclick={() => ui.exportDraftAndReload()}>Export draft & reload</button
        >{/if}<button class="text-button" onclick={() => library.flush().catch(() => {})}
        >Retry save</button
      ><button class="icon-button" aria-label="Dismiss error" onclick={() => (library.error = '')}
        ><X size={15} /></button
      >
    </div>{/if}
  {#if active}
    {#if active.inbox}<div class="inbox-banner">
        <Tray size={17} /><span>A new idea, ready to make your own.</span><button
          class="text-button accent"
          onclick={() => ui.keepInLibrary()}>Keep in library <ArrowUpRight size={14} /></button
        >
      </div>{/if}
    {#if active.trashed}<div class="inbox-banner">
        <Trash size={17} /><span>This note is in Trash.</span><button
          class="text-button accent"
          onclick={() => ui.toggleTrash()}>Restore note <ArrowCounterClockwise size={14} /></button
        >
      </div>{/if}
    <div class="document-body" class:with-panel={ui.panel && !ui.focus}>
      <section class="writing-surface" class:split-mode={ui.mode === 'split'}>
        <div class="document-heading">
          <textarea
            bind:this={titleField}
            rows="1"
            class="document-title"
            aria-label="Note title"
            value={active.title}
            placeholder="Untitled note"
            oninput={(e) => ui.change({ title: e.currentTarget.value.replace(/[\r\n]/g, ' ') })}
          ></textarea>
          <div class="document-meta">
            <span>{dateLabel(active.createdAt)}</span><span class="meta-separator">·</span><span
              >{totalWords} {totalWords === 1 ? 'word' : 'words'}</span
            ><span class="meta-separator">·</span><span
              >{Math.max(1, Math.ceil(totalWords / 220))} min read</span
            >{#if active.intent !== 'reference'}<span class="tag intent-label"
                ><Brain size={12} />{active.intent === 'apply'
                  ? 'Learning to apply'
                  : 'Learning to remember'}</span
              >{/if}{#each active.tags.slice(0, 3) as tag}<span class="tag">{tag}</span>{/each}
          </div>
        </div>
        {#if ui.mode !== 'read'}<FormatToolbar {editor} />{/if}
        <div class="editor-content" class:two-panes={ui.mode === 'split'}>
          {#if ui.mode !== 'read'}<div class="source-pane">
              {#key active.id}<Editor
                  bind:this={editor}
                  value={active.body}
                  onchange={(body) => ui.change({ body })}
                />{/key}
            </div>{/if}
          {#if ui.mode !== 'write'}<div class="preview-pane">
              {#if active.body}<Markdown value={active.body} />{:else}<div class="blank-document">
                  <PencilSimple size={25} weight="light" />
                  <p>Your next idea belongs here.</p>
                  <button class="text-button accent" onclick={() => (ui.mode = 'write')}
                    >Start writing <ArrowUpRight size={14} /></button
                  >
                </div>{/if}
            </div>{/if}
        </div>
      </section>
      {#if ui.panel && !ui.focus}<DetailsPanel note={active} />{/if}
    </div>
  {:else}<div class="workspace-empty">
      <SunHorizon size={48} weight="thin" />
      <h2>A space for your next thought.</h2>
      <p>Select a note, or start with a blank page.</p>
      <button class="primary-button" onclick={() => ui.createNote()}
        ><Plus size={16} /> New note</button
      >
    </div>{/if}
</main>
