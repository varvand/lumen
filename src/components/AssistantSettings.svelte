<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowClockwise } from 'phosphor-svelte';
  import Select from './Select.svelte';
  import { PROVIDER_NAMES, tutor, type Provider } from '../lib/tutor';

  let providers = $state<Provider[] | null>(null);
  let provider = $state<Provider | undefined>();
  let models = $state<string[] | null>(null);
  let model = $state<string | undefined>();
  let ollamaError = $state('');
  let checking = $state(false);

  async function check() {
    checking = true;
    const [found, local] = await Promise.allSettled([tutor.providers(), tutor.ollamaModels()]);
    providers = found.status === 'fulfilled' ? found.value : [];
    provider = tutor.preferred(providers);
    models = local.status === 'fulfilled' ? local.value : null;
    ollamaError = local.status === 'rejected' ? String(local.reason) : '';
    model = models ? tutor.ollamaModel(models) : undefined;
    checking = false;
  }
  onMount(() => void check());
</script>

<div class="settings-section">
  <h3>Practice assistant</h3>
  <p class="helper">
    Answers your questions about practice cards, and writes practice questions when you turn a note
    into something to learn. Claude and ChatGPT use your own subscription; Ollama runs a model on
    this computer.
  </p>
  <div class="setting-row">
    <span class="setting-label">Assistant</span>
    {#if providers && providers.length > 1}<Select
        label="Assistant"
        value={provider ?? providers[0]}
        onchange={(value) => {
          provider = value;
          tutor.remember(value);
        }}
        options={providers.map((p) => ({ value: p, label: PROVIDER_NAMES[p] }))}
      />{:else}<span class="helper"
        >{providers === null
          ? 'Looking…'
          : provider
            ? PROVIDER_NAMES[provider]
            : 'Install Claude Code, Codex or Ollama'}</span
      >{/if}
  </div>
  <div class="setting-row">
    <span class="setting-label">Ollama model</span>
    {#if models?.length}<Select
        label="Ollama model"
        value={model ?? models[0]}
        onchange={(value) => {
          model = value;
          tutor.rememberModel(value);
        }}
        options={models.map((m) => ({ value: m, label: m }))}
      />{:else}<button class="secondary-button" disabled={checking} onclick={check}
        ><ArrowClockwise size={15} />Check again</button
      >{/if}
  </div>
  {#if ollamaError}<p class="helper">
      Ollama isn’t running. Install it from ollama.com, start it, and download a model, for example <code
        >ollama pull gemma3</code
      >.
    </p>{:else if models && !models.length}<p class="helper">
      Ollama is running but has no models yet. Download one, for example
      <code>ollama pull gemma3</code>.
    </p>{/if}
</div>
