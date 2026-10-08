<script lang="ts">
  import {
    SunHorizon,
    Plus,
    Tray,
    Brain,
    CaretRight,
    ArrowUpRight,
    ArrowCounterClockwise,
    Check,
    DownloadSimple,
    FileText,
    SidebarSimple,
    ArrowsOutSimple,
    ArrowsInSimple,
    PushPin,
    X,
    Trash,
    Sigma,
    BookOpen,
    PencilSimple,
    Columns,
    WarningCircle,
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

<main class="document-workspace">
  <header class="document-toolbar" data-tauri-drag-region>
    <div class="breadcrumbs" data-tauri-drag-region>
      <button
        class="icon-button nav-toggle"
        aria-label="Toggle navigation"
        onclick={() => (ui.mobileNav = !ui.mobileNav)}><SidebarSimple size={18} /></button
      >{#if ui.focus}<button
          class="icon-button"
          aria-label="Exit focus mode"
          onclick={() => (ui.focus = false)}><ArrowsInSimple size={18} /></button
        >{/if}<span>{active?.collection || 'Library'}</span><CaretRight size={12} /><span
        class="breadcrumb-title">{active?.title || 'Your notes'}</span
      >
    </div>
    <div class="toolbar-actions">
      {#if active}<button
          class="icon-button"
          aria-label={active.pinned ? 'Unpin note' : 'Pin note'}
          title={active.pinned ? 'Unpin note' : 'Pin note'}
          onclick={() => ui.change({ pinned: !active.pinned })}
          ><PushPin size={17} weight={active.pinned ? 'fill' : 'regular'} /></button
        ><button
          class="icon-button"
          aria-label="Export Markdown"
          title="Export Markdown"
          onclick={() => ui.exportActive()}><DownloadSimple size={17} /></button
        ><button
          class="icon-button"
          aria-label="Focus mode"
          title="Focus mode (⌘ ⇧ F)"
          onclick={() => (ui.focus = !ui.focus)}><ArrowsOutSimple size={17} /></button
        ><span class="toolbar-divider"></span><button
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
    <div class="document-controls">
      <div class="editor-tabs" role="group" aria-label="Editor view">
        <button class:chosen={ui.mode === 'write'} onclick={() => (ui.mode = 'write')}
          ><PencilSimple size={14} />Write</button
        ><button class:chosen={ui.mode === 'split'} onclick={() => (ui.mode = 'split')}
          ><Columns size={14} />Split</button
        ><button class:chosen={ui.mode === 'read'} onclick={() => (ui.mode = 'read')}
          ><BookOpen size={14} />Read</button
        >
      </div>
      <span class="save-state"
        >{#if library.saving}<span class="status-dot"
          ></span>Saving…{:else if library.isDirty(active.id)}Unsaved changes{:else}<Check
            size={13}
          />Saved{/if}</span
      >
    </div>
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
          <div class="document-kicker">
            <FileText size={14} /><span>MARKDOWN NOTE</span>{#if active.intent !== 'reference'}<span
                class="intent-label"
                ><Brain size={12} />{active.intent === 'apply'
                  ? 'Learning to apply'
                  : 'Learning to remember'}</span
              >{/if}
          </div>
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
            <span>{dateLabel(active.createdAt)}</span><span class="meta-separator">/</span><span
              >{Math.max(1, Math.ceil(totalWords / 220))} min read</span
            >{#each active.tags.slice(0, 3) as tag}<span class="tag">{tag}</span>{/each}
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
    <footer class="document-status">
      <span
        >{totalWords} words<span class="status-divider">·</span>{active.body.length} characters</span
      ><span
        >{ui.mode !== 'read' ? 'Markdown' : 'Reading'}<span class="status-divider">·</span><Sigma
          size={12}
        /> LaTeX supported</span
      >
    </footer>
  {:else}<div class="workspace-empty">
      <SunHorizon size={48} weight="thin" />
      <h2>A space for your next thought.</h2>
      <p>Select a note, or start with a blank page.</p>
      <button class="primary-button" onclick={() => ui.createNote()}
        ><Plus size={16} /> New note</button
      >
    </div>{/if}
</main>
