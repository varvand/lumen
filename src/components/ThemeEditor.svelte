<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Moon, Sun, Trash } from 'phosphor-svelte';
  import { preferences } from '../lib/preferences.svelte';
  import { TOKENS, TOKEN_LABELS, type ThemeDefinition } from '../lib/themes';

  let { theme, onclose }: { theme: ThemeDefinition; onclose: () => void } = $props();

  // Edit a copy, previewed live across the whole app until saved or discarded.
  // svelte-ignore state_referenced_locally
  const draft = $state<ThemeDefinition>({ ...theme, colors: { ...theme.colors } });
  const saved = preferences.customThemes.some((t) => t.id === theme.id);
  preferences.preview = draft;
  onDestroy(() => (preferences.preview = null));

  function save() {
    preferences.saveCustomTheme({ ...draft, name: draft.name.trim() || 'Custom theme' });
    onclose();
  }
  function remove() {
    preferences.deleteCustomTheme(theme.id);
    onclose();
  }
</script>

<div class="theme-editor">
  <label class="setting-row"
    >Name<input class="text-input" bind:value={draft.name} maxlength="40" /></label
  >
  <div class="setting-row">
    Base appearance
    <div class="segmented" role="radiogroup" aria-label="Base appearance">
      <button
        role="radio"
        aria-checked={!draft.dark}
        class:chosen={!draft.dark}
        onclick={() => (draft.dark = false)}><Sun size={14} />Light</button
      ><button
        role="radio"
        aria-checked={draft.dark}
        class:chosen={draft.dark}
        onclick={() => (draft.dark = true)}><Moon size={14} />Dark</button
      >
    </div>
  </div>
  <div class="color-grid">
    {#each TOKENS as token}<label class="color-field"
        ><input
          type="color"
          aria-label={TOKEN_LABELS[token]}
          bind:value={draft.colors[token]}
        /><span>{TOKEN_LABELS[token]}<code>{draft.colors[token]}</code></span></label
      >{/each}
  </div>
  <div class="theme-editor-actions">
    {#if saved}<button class="secondary-button danger" onclick={remove}
        ><Trash size={15} />Delete</button
      >{/if}
    <button class="secondary-button" onclick={onclose}>Cancel</button>
    <button class="primary-button" onclick={save}>Save theme</button>
  </div>
</div>
