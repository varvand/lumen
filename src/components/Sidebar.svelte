<script lang="ts">
  import {
    SunHorizon,
    House,
    MagnifyingGlass,
    Plus,
    Files,
    Tray,
    Brain,
    Graph,
    FolderSimple,
    GearSix,
    Trash,
    ArrowCircleUp,
    SidebarSimple,
    CaretDown,
    CaretRight,
    FolderOpen,
    Check,
    X,
  } from 'phosphor-svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { updates } from '../lib/updates.svelte';
  import {
    collectionPath,
    inCollection,
    orderFolders,
    reorderFolders,
    type CollectionFolder,
  } from '../lib/collections';
  import CollectionMenu from './CollectionMenu.svelte';

  /** Collapsed, the sidebar is an icon rail; labels move into tooltips. */
  const tip = (label: string) => (ui.sidebarCollapsed ? label : undefined);

  let naming = $state(false);
  let collectionName = $state('');
  let parentFolder = $state('');
  let creating = $state(false);
  const collectionsOpen = $derived(ui.isExpanded('collections'));
  const folderTree = $derived(orderFolders(library.folders, ui.collectionOrder));

  let menu = $state<{ path: string; x: number; y: number; trigger: HTMLElement }>();
  function openMenu(event: MouseEvent | KeyboardEvent, path: string) {
    event.preventDefault();
    const trigger = event.currentTarget as HTMLElement;
    // A menu opened from the keyboard has no pointer position, so anchor it to the row.
    const row = trigger.getBoundingClientRect();
    const pointer = 'clientX' in event && (event.clientX || event.clientY);
    menu = {
      path,
      x: pointer ? event.clientX : row.left + 16,
      y: pointer ? event.clientY : row.bottom,
      trigger,
    };
  }

  /** The folder being renamed in place, and its new name. */
  let renaming = $state('');
  let newName = $state('');
  function startRename(path: string) {
    renaming = path;
    newName = path.split(' / ').pop() ?? '';
  }
  function finishRename() {
    const from = renaming;
    if (!from) return;
    renaming = '';
    const name = collectionPath(newName);
    const parent = from.split(' / ').slice(0, -1).join(' / ');
    if (name) void ui.renameCollection(from, parent ? `${parent} / ${name}` : name);
  }

  /** Dragging reorders a folder among its siblings; its place is remembered per device. */
  const DRAG_TYPE = 'application/x-lumen-collection';
  let dragging = $state<{ path: string; siblings: string[] }>();
  let dropTarget = $state<{ path: string; after: boolean }>();
  function dragOver(event: DragEvent, path: string) {
    if (!dragging || !dragging.siblings.includes(path) || dragging.path === path) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    const row = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dropTarget = { path, after: event.clientY > row.top + row.height / 2 };
  }
  function drop(event: DragEvent) {
    if (!dragging || !dropTarget) return;
    event.preventDefault();
    ui.setCollectionOrder(
      reorderFolders(
        ui.collectionOrder,
        dragging.siblings,
        dragging.path,
        dropTarget.path,
        dropTarget.after,
      ),
    );
    endDrag();
  }
  function endDrag() {
    dragging = undefined;
    dropTarget = undefined;
  }

  /** Name a collection in place; it starts with one blank note, since notes define collections. */
  function startCollection(parent = '') {
    if (ui.sidebarCollapsed) ui.toggleSidebar();
    ui.setExpanded('collections', true);
    if (parent) ui.setExpanded(`folder:${parent}`, true);
    parentFolder = parent;
    collectionName = '';
    naming = true;
  }
  const focus = (node: HTMLInputElement) => {
    node.focus();
    node.select();
  };
  async function createCollection() {
    const child = collectionPath(collectionName);
    if (!child || creating) return;
    const name = parentFolder ? `${parentFolder} / ${child}` : child;
    creating = true;
    try {
      if (!library.collections.some((item) => inCollection(item, name))) {
        const note = await ui.createNote({ collection: name, inbox: false });
        if (!note) return;
      }
      const parts = name.split(' / ');
      for (let i = 1; i < parts.length; i++)
        ui.setExpanded(`folder:${parts.slice(0, i).join(' / ')}`, true);
      await ui.browse('library', name);
      naming = false;
    } finally {
      creating = false;
    }
  }
  function showCollections() {
    if (ui.sidebarCollapsed) ui.toggleSidebar();
    ui.setExpanded('collections', true);
  }
</script>

{#snippet folders(items: CollectionFolder[], depth = 0)}
  <ul class="folder-level">
    {#each items as folder (folder.path)}
      {@const expanded = ui.isExpanded(`folder:${folder.path}`)}
      {@const active = ui.screen === 'library' && collectionPath(ui.collection) === folder.path}
      <li>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="folder-row"
          class:active
          class:menu-target={menu?.path === folder.path}
          class:dragging={dragging?.path === folder.path}
          class:drop-before={dropTarget?.path === folder.path && !dropTarget.after}
          class:drop-after={dropTarget?.path === folder.path && dropTarget.after}
          style={`--folder-depth: ${depth}`}
          draggable={renaming !== folder.path}
          ondragstart={(e) => {
            e.dataTransfer?.setData(DRAG_TYPE, folder.path);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            dragging = { path: folder.path, siblings: items.map((item) => item.path) };
          }}
          ondragover={(e) => dragOver(e, folder.path)}
          ondrop={drop}
          ondragend={endDrag}
        >
          {#if folder.children.length}
            <button
              class="folder-disclosure"
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${folder.path}`}
              aria-expanded={expanded}
              onclick={() => ui.setExpanded(`folder:${folder.path}`, !expanded)}
            >
              {#if expanded}<CaretDown size={11} />{:else}<CaretRight size={11} />{/if}
            </button>
          {:else}<span class="folder-disclosure-spacer"></span>{/if}
          {#if renaming === folder.path}
            <form
              class="folder-rename"
              onsubmit={(e) => {
                e.preventDefault();
                finishRename();
              }}
            >
              <FolderSimple size={16} /><input
                use:focus
                aria-label={`Rename ${folder.path}`}
                maxlength="80"
                bind:value={newName}
                onblur={finishRename}
                onkeydown={(e) => {
                  if (e.key === 'Escape') renaming = '';
                }}
              />
            </form>
          {:else}<button
              class="folder-link"
              aria-label={folder.path}
              aria-current={active ? 'page' : undefined}
              title={folder.path}
              onclick={() => {
                if (folder.children.length) ui.setExpanded(`folder:${folder.path}`, !expanded);
                void ui.browse('library', folder.path);
              }}
              oncontextmenu={(e) => openMenu(e, folder.path)}
              onkeydown={(e) => {
                if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))
                  openMenu(e, folder.path);
              }}
            >
              {#if active}<FolderOpen size={16} />{:else}<FolderSimple size={16} />{/if}
              <span class="folder-label">{folder.name}</span><span
                class="folder-count"
                aria-hidden="true">{folder.count}</span
              >
            </button>{/if}
          <button
            class="folder-add"
            title="New subfolder"
            aria-label={`Add subfolder to ${folder.path}`}
            onclick={() => startCollection(folder.path)}><Plus size={12} /></button
          >
        </div>
        {#if folder.children.length && expanded}{@render folders(folder.children, depth + 1)}{/if}
      </li>
    {/each}
  </ul>
{/snippet}

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
      class:active={ui.screen === 'home'}
      title={tip('Home')}
      onclick={() => ui.navigate('home')}><House size={19} /><span>Home</span></button
    >
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
    <button
      class:active={ui.screen === 'graph'}
      title={tip('Graph')}
      onclick={() => ui.navigate('graph')}><Graph size={19} /><span>Graph</span></button
    >
  </nav>
  <button
    class="collections-rail"
    class:active={ui.screen === 'library' && !!ui.collection}
    aria-label="Browse collections"
    title={ui.collection || 'Collections'}
    onclick={showCollections}
  >
    <FolderSimple size={19} />
  </button>
  <div class="collection-heading">
    <button
      class="collection-section-toggle"
      aria-label={collectionsOpen ? 'Collapse collections' : 'Expand collections'}
      aria-expanded={collectionsOpen}
      onclick={() => ui.setExpanded('collections', !collectionsOpen)}
    >
      {#if collectionsOpen}<CaretDown size={11} />{:else}<CaretRight size={11} />{/if}<span
        >Collections</span
      >
    </button><button
      class="icon-button small"
      title="New collection"
      aria-label="New collection"
      onclick={() => startCollection()}><Plus size={14} /></button
    >
  </div>
  <nav class="collection-nav" aria-label="Collections" hidden={!collectionsOpen}>
    {#if naming}
      <form
        class="collection-create"
        onsubmit={(e) => {
          e.preventDefault();
          void createCollection();
        }}
      >
        {#if parentFolder}<span class="collection-parent" title={parentFolder}
            >Inside {parentFolder}</span
          >{/if}
        <div class="collection-name">
          <FolderSimple size={15} /><input
            use:focus
            aria-label="Collection name"
            placeholder={parentFolder ? 'Subfolder name' : 'Collection name'}
            maxlength="80"
            bind:value={collectionName}
            onkeydown={(e) => {
              if (e.key === 'Escape' && !creating) naming = false;
            }}
            disabled={creating}
          /><button
            type="submit"
            class="icon-button small"
            aria-label="Create collection"
            disabled={creating || !collectionPath(collectionName)}><Check size={13} /></button
          >
        </div>
        <div class="collection-create-footer">
          <span>Use / to nest folders</span><button
            type="button"
            class="icon-button small"
            aria-label="Cancel collection"
            disabled={creating}
            onclick={() => (naming = false)}><X size={12} /></button
          >
        </div>
      </form>
    {/if}
    {@render folders(folderTree)}
    {#if !library.folders.length && !naming}<p class="collections-empty">
        Keep related notes together. Create your first collection above.
      </p>{/if}
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
{#if menu}<CollectionMenu
    {...menu}
    onsubfolder={() => startCollection(menu!.path)}
    onrename={() => startRename(menu!.path)}
    onclose={() => (menu = undefined)}
  />{/if}
