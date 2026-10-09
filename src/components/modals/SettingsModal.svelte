<script lang="ts">
  import { ArrowUpRight, DownloadSimple, FolderSimple, PencilSimple, Plus } from 'phosphor-svelte';
  import Select from '../Select.svelte';
  import Modal from '../Modal.svelte';
  import ThemeEditor from '../ThemeEditor.svelte';
  import ChatAppsSettings from '../ChatAppsSettings.svelte';
  import { library } from '../../lib/library.svelte';
  import { preferences, UI_SCALE } from '../../lib/preferences.svelte';
  import { BUILTIN_THEMES, newThemeId, type ThemeDefinition } from '../../lib/themes';
  import { ui } from '../../lib/ui.svelte';
  import { native } from '../../lib/storage';
  import { formatRelease, updates } from '../../lib/updates.svelte';

  const [light, dark] = BUILTIN_THEMES;
  let editing = $state<ThemeDefinition | null>(null);

  function createTheme() {
    const base = preferences.active;
    editing = {
      ...base,
      id: newThemeId(),
      name: base.custom ? `${base.name} copy` : `My ${base.name}`,
      custom: true,
    };
  }

  async function openFolder() {
    const { openPath } = await import('@tauri-apps/plugin-opener');
    await openPath(library.path);
  }
</script>

{#snippet swatch(theme: ThemeDefinition)}
  <span class="swatch-sidebar" style:background={theme.colors.sidebar}></span><span
    class="swatch-page"
    style:background={theme.colors.background}
    ><span style:background={theme.colors.text}></span><span style:background={theme.colors.muted}
    ></span><span class="swatch-accent" style:background={theme.colors.accent}></span></span
  >
{/snippet}

<Modal title="Settings" onclose={() => ui.close()}
  ><div class="settings-section">
    <h3>Appearance</h3>
    {#if editing}
      <ThemeEditor theme={editing} onclose={() => (editing = null)} />
    {:else}
      <div class="theme-options" role="radiogroup" aria-label="Theme">
        <button
          role="radio"
          aria-checked={preferences.theme === 'system'}
          class:chosen={preferences.theme === 'system'}
          onclick={() => preferences.set({ theme: 'system' })}
          ><span class="theme-swatch system"
            >{@render swatch(light)}<span class="system-half">{@render swatch(dark)}</span></span
          >System</button
        >
        {#each [...BUILTIN_THEMES, ...preferences.customThemes] as theme (theme.id)}<button
            role="radio"
            aria-checked={preferences.theme === theme.id}
            class:chosen={preferences.theme === theme.id}
            onclick={() => preferences.set({ theme: theme.id })}
            ><span class="theme-swatch">{@render swatch(theme)}</span>{theme.name}</button
          >{/each}
      </div>
      <div class="theme-actions">
        <button class="secondary-button" onclick={createTheme}
          ><Plus size={15} />New theme from {preferences.active.name}</button
        >
        {#if preferences.active.custom && preferences.theme !== 'system'}<button
            class="secondary-button"
            onclick={() => (editing = preferences.active)}
            ><PencilSimple size={15} />Edit {preferences.active.name}</button
          >{/if}
      </div>
    {/if}
    <label class="setting-row"
      >Color each tag<input
        type="checkbox"
        role="switch"
        checked={preferences.colorfulTags}
        onchange={(e) => preferences.set({ colorfulTags: e.currentTarget.checked })}
      /></label
    >
  </div>
  <div class="settings-section">
    <h3>Text</h3>
    <div class="setting-row">
      <span class="setting-label">Document typeface</span><Select
        label="Document typeface"
        value={preferences.readerFont}
        onchange={(readerFont) => preferences.set({ readerFont })}
        options={[
          { value: 'serif', label: 'Newsreader · Serif' },
          { value: 'sans', label: 'DM Sans · Sans serif' },
        ]}
      />
    </div>
    <label class="setting-row"
      >Interface text <span>{Math.round(preferences.uiScale * 100)}% · ⌘+ ⌘− ⌘0</span><input
        aria-label="Interface text size"
        type="range"
        min={UI_SCALE.min}
        max={UI_SCALE.max}
        step={UI_SCALE.step}
        value={preferences.uiScale}
        oninput={(e) => preferences.set({ uiScale: Number(e.currentTarget.value) })}
      /></label
    ><label class="setting-row"
      >Document text <span>{preferences.fontSize}px</span><input
        aria-label="Reading text size"
        type="range"
        min="14"
        max="22"
        value={preferences.fontSize}
        oninput={(e) => preferences.set({ fontSize: Number(e.currentTarget.value) })}
      /></label
    >
    <label class="setting-row"
      >Render Markdown in the editor<input
        type="checkbox"
        role="switch"
        checked={preferences.livePreview}
        onchange={(e) => preferences.set({ livePreview: e.currentTarget.checked })}
      /></label
    >
  </div>
  <div class="settings-section">
    <h3>Your library</h3>
    <p class="storage-path">{library.path}</p>
    <p class="helper">
      {native
        ? 'Notes are plain .md files. Review history and note details live in SQLite alongside them. Back up the entire library folder to preserve both.'
        : 'This preview uses browser storage. The desktop app saves Markdown files and review history to your computer. Export important notes before clearing browser data.'}
    </p>
    <div class="library-actions">
      {#if native}<button class="secondary-button" onclick={openFolder}
          ><FolderSimple size={16} />Open library folder</button
        >{/if}<button class="secondary-button" onclick={() => ui.open('obsidian')}
        ><DownloadSimple size={16} />Import Obsidian vault</button
      >
    </div>
  </div>
  <ChatAppsSettings />
  {#if updates.enabled}<div class="settings-section">
      <h3>Updates</h3>
      <div class="setting-row">
        Lumen {updates.current ? formatRelease(updates.current) : ''}
        {#if updates.available}<button
            class="primary-button"
            disabled={updates.status === 'downloading' || updates.status === 'installing'}
            onclick={() => updates.install()}
            >{updates.status === 'downloading' || updates.status === 'installing'
              ? 'Installing…'
              : `Install ${formatRelease(updates.available)}`}</button
          >{:else}<button
            class="secondary-button"
            disabled={updates.status === 'checking'}
            onclick={() => updates.check()}
            >{updates.status === 'checking' ? 'Checking…' : 'Check for updates'}</button
          >{/if}
      </div>
      <p class="helper">
        {#if updates.status === 'error'}{updates.error}{:else if updates.status === 'current'}You
          have the latest build.{:else}Lumen checks the latest build of the main branch every few
          hours. Updates install only when you choose, then Lumen relaunches.{/if}
      </p>
    </div>{/if}
  <div class="settings-section">
    <h3>Built for understanding</h3>
    <p class="helper">
      Recall, self-explanation, and application are informed by learning research. Review timing
      uses a simple adaptive heuristic. Ratings are your own assessments, not verified mastery.
    </p>
    <a
      class="text-link"
      href="https://doi.org/10.1177/1529100612453266"
      target="_blank"
      rel="noreferrer">Read the learning-techniques review <ArrowUpRight size={13} /></a
    >
  </div></Modal
>
