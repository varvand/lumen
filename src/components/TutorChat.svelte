<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ArrowUp, ArrowUpRight, ChatCircleText, NoteBlank, X } from 'phosphor-svelte';
  import Select from './Select.svelte';
  import Markdown from './Markdown.svelte';
  import { ui } from '../lib/ui.svelte';
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
  let body: HTMLDivElement;
  let input = $state<HTMLTextAreaElement>();
  let followLatest = $state(true);
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
        if (!alive) return;
        providers = found;
        provider = tutor.preferred(found);
      })
      .catch((e) => {
        if (!alive) return;
        providers = [];
        error = String(e);
      });
    return () => (alive = false);
  });

  async function scrollToLatest() {
    await tick();
    if (alive && followLatest && body) body.scrollTop = body.scrollHeight;
  }
  async function ask(question = draft.trim()) {
    if (!question || !provider || asking) return;
    const answeringProvider = provider;
    asking = true;
    error = '';
    draft = '';
    const prompt = tutorPrompt(card, messages, question);
    messages.push({ role: 'user', text: question });
    followLatest = true;
    await scrollToLatest();
    try {
      // Checking an attempt against the answer is worth reasoning; hints should come quickly.
      const answer = await tutor.ask(
        answeringProvider,
        prompt,
        card.revealed ? 'deep' : 'standard',
      );
      if (alive) messages.push({ role: 'assistant', text: answer, provider: answeringProvider });
    } catch (e) {
      if (!alive) return;
      error = String(e);
      messages.pop();
      draft = question;
    } finally {
      asking = false;
      if (alive) {
        await scrollToLatest();
        input?.focus();
      }
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
    <ChatCircleText size={20} />
    <div class="tutor-heading">
      <span class="tutor-title">Ask about this card</span><span class="tutor-subtitle"
        >Your practice companion</span
      >
    </div>
    <button class="icon-button" title="Close" aria-label="Close chat" onclick={onclose}
      ><X size={16} /></button
    >
  </div>
  <div class="tutor-context">
    <NoteBlank size={16} />
    <div>
      <span class="tutor-context-label">Current note</span><span
        class="tutor-context-title"
        title={card.note.title}>{card.note.title}</span
      >
    </div>
  </div>
  <div class="tutor-provider">
    <span>Chat with</span>
    {#if providers && providers.length > 1}
      <Select
        label="Chat app"
        class="tutor-provider-select"
        compact
        value={provider ?? providers[0]}
        disabled={asking}
        onchange={choose}
        options={providers.map((p) => ({ value: p, label: PROVIDER_NAMES[p] }))}
      />
    {:else if provider}<span class="tutor-provider-name">{PROVIDER_NAMES[provider]}</span>
    {:else}<span class="tutor-provider-name"
        >{providers === null ? 'Connecting…' : 'No app connected'}</span
      >{/if}
  </div>
  <div
    class="tutor-body"
    bind:this={body}
    onscroll={() => (followLatest = body.scrollHeight - body.scrollTop - body.clientHeight < 60)}
  >
    {#if providers && !providers.length}
      <div class="tutor-empty">
        <span class="tutor-empty-icon"><ChatCircleText size={24} /></span>
        <h3>Bring your chat app along</h3>
        <p>
          Install Claude Code or Codex and sign in once in a terminal to use your own subscription,
          or run a local model with Ollama.
        </p>
        <button class="secondary-button" onclick={() => ui.open('settings')}
          >Open settings <ArrowUpRight size={14} /></button
        >
      </div>
    {:else if providers === null}
      <p class="tutor-loading" role="status">Connecting to your chat apps…</p>
    {:else if !messages.length}
      <div class="tutor-empty">
        <span class="tutor-empty-icon"><ChatCircleText size={24} /></span>
        <h3>Let’s work through it</h3>
        <p>
          {card.revealed
            ? 'Ask why the answer works, what you missed, or where the topic goes next.'
            : 'Stuck? Ask for a hint. The answer stays hidden until you reveal it.'}
        </p>
        <div class="tutor-suggestions">
          {#each suggestions as s (s)}<button
              class="tutor-suggestion"
              disabled={asking}
              onclick={() => ask(s)}><span>{s}</span><ArrowUpRight size={14} /></button
            >{/each}
        </div>
      </div>
    {/if}
    <div
      class="tutor-messages"
      role="log"
      aria-label="Conversation"
      aria-live="polite"
      aria-relevant="additions"
    >
      {#each messages as message, i (i)}
        {#if message.role === 'user'}<div class="tutor-user">
            <span class="tutor-message-label">You</span>
            <p class="tutor-question">{message.text}</p>
          </div>
        {:else}<div class="tutor-answer">
            <span class="tutor-message-label"
              >{message.provider ? PROVIDER_NAMES[message.provider] : 'Assistant'}</span
            ><Markdown value={message.text} compact />
          </div>{/if}
      {/each}
    </div>
    {#if asking}<p class="tutor-thinking" role="status">
        <span class="tutor-thinking-indicator" aria-hidden="true"></span>{provider
          ? PROVIDER_NAMES[provider]
          : ''} is thinking…
      </p>{/if}
    {#if error}<p role="alert" class="error-text">{error}</p>{/if}
  </div>
  {#if providers?.length}
    <div class="tutor-compose">
      <div class="tutor-input">
        <textarea
          bind:this={input}
          aria-label="Your question"
          rows="3"
          bind:value={draft}
          onkeydown={keydown}
          placeholder={messages.length ? 'Ask a follow-up…' : 'Ask a question…'}></textarea>
        <button
          class="tutor-send"
          aria-label="Ask"
          title="Ask (Enter)"
          disabled={asking || !provider || !draft.trim()}
          onclick={() => ask()}><ArrowUp size={17} weight="bold" /></button
        >
      </div>
      <span class="tutor-input-hint">Enter to send <span>Shift + Enter for a new line</span></span>
    </div>
  {/if}
</aside>
