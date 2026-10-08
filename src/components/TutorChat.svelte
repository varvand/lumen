<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowUp, X } from 'phosphor-svelte';
  import Markdown from './Markdown.svelte';
  import {
    PROVIDER_NAMES,
    tutor,
    tutorPrompt,
    type Provider,
    type TutorCard,
    type TutorMessage,
  } from '../lib/tutor';

  let { card, onclose }: { card: TutorCard; onclose: () => void } = $props();
  let providers = $state<Provider[] | null>(null);
  let provider = $state<Provider | undefined>();
  let messages = $state<TutorMessage[]>([]);
  let draft = $state('');
  let asking = $state(false);
  let error = $state('');
  let alive = true;
  let suggestions = $derived(
    card.revealed
      ? ['Explain the suggested answer', 'Where did my answer go wrong?', 'Go deeper']
      : ['Give me a hint', 'Explain the idea behind this'],
  );

  onMount(() => {
    tutor
      .providers()
      .then((found) => {
        providers = found;
        provider = tutor.preferred(found);
      })
      .catch((e) => {
        providers = [];
        error = String(e);
      });
    return () => (alive = false);
  });

  async function ask(question = draft.trim()) {
    if (!question || !provider || asking) return;
    asking = true;
    error = '';
    draft = '';
    const prompt = tutorPrompt(card, messages, question);
    messages.push({ role: 'user', text: question });
    try {
      const answer = await tutor.ask(provider, prompt);
      if (alive) messages.push({ role: 'assistant', text: answer });
    } catch (e) {
      if (!alive) return;
      error = String(e);
      messages.pop();
      draft = question;
    } finally {
      asking = false;
    }
  }
  function choose(value: Provider) {
    provider = value;
    tutor.remember(value);
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void ask();
    }
  }
</script>

<aside class="tutor" aria-label="Ask about this card">
  <div class="tutor-head">
    <span class="tutor-title">Ask about this card</span>
    {#if providers && providers.length > 1}<select
        class="select-input"
        aria-label="Chat app"
        value={provider}
        disabled={asking}
        onchange={(e) => choose(e.currentTarget.value as Provider)}
        >{#each providers as p (p)}<option value={p}>{PROVIDER_NAMES[p]}</option>{/each}</select
      >{:else if provider}<span class="subtle">{PROVIDER_NAMES[provider]}</span>{/if}
    <button class="icon-button" title="Close" aria-label="Close chat" onclick={onclose}
      ><X size={15} /></button
    >
  </div>
  <div class="tutor-body" aria-live="polite">
    {#if providers && !providers.length}
      <p class="helper">
        Install Claude Code (<code>claude</code>) or Codex (<code>codex</code>) and sign in once in
        a terminal. Lumen asks through them, so answers use your own subscription.
      </p>
    {:else if providers && !messages.length}
      <p class="helper">
        {card.revealed
          ? 'Ask why the answer works, what you missed, or where the topic goes next.'
          : 'Stuck? Ask for a hint. The answer stays hidden until you reveal it.'}
      </p>
      <div class="tutor-suggestions">
        {#each suggestions as s (s)}<button
            class="secondary-button"
            disabled={asking}
            onclick={() => ask(s)}>{s}</button
          >{/each}
      </div>
    {/if}
    {#each messages as message, i (i)}
      {#if message.role === 'user'}<p class="tutor-question">{message.text}</p>
      {:else}<div class="tutor-answer"><Markdown value={message.text} compact /></div>{/if}
    {/each}
    {#if asking}<p class="helper tutor-thinking">
        {provider ? PROVIDER_NAMES[provider] : ''} is thinking…
      </p>{/if}
    {#if error}<p role="alert" class="error-text">{error}</p>{/if}
  </div>
  {#if providers?.length}
    <div class="tutor-input">
      <textarea
        aria-label="Your question"
        rows="2"
        bind:value={draft}
        onkeydown={keydown}
        placeholder={messages.length ? 'Ask a follow-up…' : 'Ask a question…'}></textarea><button
        class="primary-button"
        aria-label="Ask"
        title="Ask (Enter)"
        disabled={asking || !draft.trim()}
        onclick={() => ask()}><ArrowUp size={16} /></button
      >
    </div>
  {/if}
</aside>
