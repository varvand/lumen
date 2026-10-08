<script lang="ts">
  import { onMount } from 'svelte';
  import { Check } from 'phosphor-svelte';
  import Sidebar from './components/Sidebar.svelte';
  import NoteList from './components/NoteList.svelte';
  import DocumentPane from './components/DocumentPane.svelte';
  import Practice from './components/Practice.svelte';
  import SearchModal from './components/modals/SearchModal.svelte';
  import CaptureModal from './components/modals/CaptureModal.svelte';
  import SettingsModal from './components/modals/SettingsModal.svelte';
  import QuestionModal from './components/modals/QuestionModal.svelte';
  import { library } from './lib/library.svelte';
  import { preferences } from './lib/preferences.svelte';
  import { ui } from './lib/ui.svelte';
  import { native } from './lib/storage';
  import { themeStyle } from './lib/themes';
  import { updates } from './lib/updates.svelte';

  /** The desktop window draws its content under the macOS traffic lights. */
  const macTitlebar = native && /Mac/.test(navigator.userAgent);

  let importInput: HTMLInputElement;

  $effect(() => {
    const { background, sidebar } = preferences.active.colors;
    const root = document.documentElement;
    root.style.background = background;
    root.style.colorScheme = preferences.active.dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sidebar);
    if (native) {
      // Match the native window (traffic lights, resize backdrop) to the theme.
      const theme = preferences.active.dark ? 'dark' : 'light';
      void import('@tauri-apps/api/window')
        .then(async ({ getCurrentWindow }) => {
          const appWindow = getCurrentWindow();
          await appWindow.setTheme(theme);
          await appWindow.setBackgroundColor(background);
        })
        .catch(() => {});
    }
  });

  async function importFiles() {
    const files = Array.from(importInput.files || []);
    await ui.importFiles(files);
    importInput.value = '';
  }
  function shortcut(event: KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    // ⌃⌘S, the macOS convention for showing and hiding a sidebar.
    if (event.metaKey && event.ctrlKey && key === 's') {
      event.preventDefault();
      ui.toggleSidebar();
      return;
    }
    if (key === 'k') {
      event.preventDefault();
      ui.open('search');
    }
    if (key === 'n') {
      event.preventDefault();
      void ui.createNote();
    }
    if (key === 's') {
      event.preventDefault();
      void library
        .flush()
        .then(() => ui.notify('All changes saved'))
        .catch(() => {});
    }
    if (event.shiftKey && key === 'f') {
      event.preventDefault();
      ui.focus = !ui.focus;
    }
  }

  onMount(() => {
    ui.importPicker = importInput;
    ui.panel = window.innerWidth >= 1300;
    preferences.load();
    updates.start();
    void library.refresh().finally(() => {
      library.loading = false;
      if (!library.live.some((n) => n.id === ui.activeId)) ui.activeId = library.live[0]?.id || '';
    });
    const refresh = () => void library.refresh();
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (library.busy) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('focus', refresh);
    window.addEventListener('keydown', shortcut);
    let unlisten: (() => void) | undefined;
    if (native)
      void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
        unlisten = await getCurrentWindow().onCloseRequested(async (e) => {
          if (!library.busy) return;
          e.preventDefault();
          try {
            await library.flush();
            await getCurrentWindow().destroy();
          } catch {
            /* Keep the editor open on save failure. */
          }
        });
      });
    return () => {
      unlisten?.();
      ui.dispose();
      updates.dispose();
      library.dispose();
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('keydown', shortcut);
    };
  });
</script>

<div
  class="app-shell"
  class:focus-mode={ui.focus}
  class:mobile-nav={ui.mobileNav}
  class:mac-titlebar={macTitlebar}
  class:sidebar-collapsed={ui.sidebarCollapsed}
  data-theme={preferences.active.dark ? 'dark' : 'light'}
  data-reader={preferences.readerFont}
  style={`--reader-size: ${preferences.fontSize}px; ${themeStyle(preferences.active)}`}
>
  <Sidebar />

  {#if ui.screen === 'practice'}
    <main class="practice-container">
      <Practice
        due={library.due}
        latest={library.latest}
        onsave={(attempt) => library.recordAttempt(attempt)}
        onopen={(id) => {
          const note = library.get(id);
          if (note) void ui.reveal(note);
        }}
        onback={() => ui.navigate('library')}
      />
    </main>
  {:else}
    <NoteList />
    <DocumentPane />
  {/if}
  <input
    class="visually-hidden"
    type="file"
    accept=".md,.markdown,text/markdown"
    multiple
    bind:this={importInput}
    onchange={importFiles}
    aria-label="Import Markdown files"
  />
  <datalist id="collections"
    >{#each library.collections as item}<option value={item}></option>{/each}</datalist
  >

  {#if ui.toast}<div class="toast" role="status"><Check size={16} />{ui.toast}</div>{/if}

  {#if ui.modal === 'search'}<SearchModal />{/if}
  {#if ui.modal === 'capture'}<CaptureModal />{/if}
  {#if ui.modal === 'settings'}<SettingsModal />{/if}
  {#if ui.modal === 'question' && ui.active}<QuestionModal note={ui.active} />{/if}
</div>
