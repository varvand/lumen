<script lang="ts">
  import { ArrowRight, ArrowLeft, ChatCircleText } from 'phosphor-svelte';
  import type { Attempt } from '../lib/types';
  import { latestAttempt, schedule, type LatestAttempts, type PracticeItem } from '../lib/learning';
  import Markdown from './Markdown.svelte';
  import TutorChat from './TutorChat.svelte';
  import { native } from '../lib/storage';
  import { tutor } from '../lib/tutor';
  let {
    due,
    latest,
    onsave,
    onopen,
    onback,
  }: {
    due: PracticeItem[];
    latest: LatestAttempts;
    onsave: (a: Attempt) => Promise<void>;
    onopen: (id: string) => void;
    onback: () => void;
  } = $props();
  let session = $state<PracticeItem[]>([]);
  let started = $state(false);
  let index = $state(0);
  let response = $state('');
  let revealed = $state(false);
  let saving = $state(false);
  let error = $state('');
  let completed = $state(0);
  let current = $derived(session[index]);
  let noteCount = $derived(new Set(due.map((q) => q.note.id)).size);
  let finished = $derived(started && index >= session.length);
  let previous = $derived(current && latestAttempt(latest, current.prompt.id, current.note.id));
  let chatOpen = $state(tutor.open);
  let canChat = $derived(native && !!current && !finished);
  function toggleChat(open = !chatOpen) {
    chatOpen = open;
    tutor.open = open;
  }
  let effortDays = $derived(schedule('effort', previous).intervalDays);
  let gotItDays = $derived(schedule('got-it', previous).intervalDays);
  function start() {
    session = due.slice(0, 8);
    index = 0;
    started = true;
    completed = 0;
    response = '';
    revealed = false;
  }
  async function rate(rating: Attempt['rating']) {
    if (!current || saving) return;
    saving = true;
    error = '';
    try {
      const now = Date.now();
      await onsave({
        id: crypto.randomUUID(),
        noteId: current.note.id,
        promptId: current.prompt.id,
        kind: current.prompt.kind,
        response,
        rating,
        reviewedAt: now,
        ...schedule(rating, previous, now),
      });
      index++;
      completed++;
      response = '';
      revealed = false;
    } catch (e) {
      error = String(e);
    } finally {
      saving = false;
    }
  }
</script>

<div class="practice-layout">
  <div class="practice-page">
    <header class="page-top" data-tauri-drag-region>
      <button class="text-button" onclick={onback}><ArrowLeft size={15} /> Library</button>
      {#if canChat && !chatOpen}<button class="text-button" onclick={() => toggleChat(true)}
          ><ChatCircleText size={15} /> Ask</button
        >{:else}<span class="subtle">Practice</span>{/if}
    </header>
    <div class="practice-inner">
      {#if !started}
        <h1>What stayed with you?</h1>
        <div class="session-overview">
          <strong>{due.length}</strong><span
            >{due.length === 1 ? 'question' : 'questions'} ready<br /><small
              >from {noteCount} {noteCount === 1 ? 'note' : 'notes'} · up to 8 per session</small
            ></span
          >
        </div>
        <button class="primary-button" onclick={start} disabled={!due.length}
          >Start a short session <ArrowRight size={17} /></button
        >
        {#if !due.length}<p class="helper">
            You’re up to date. Add questions in a note’s learning panel, or return when a review is
            due.
          </p>{/if}
      {:else if finished}
        <h1>Session complete</h1>
        <p class="practice-intro">
          You worked through {completed}
          {completed === 1 ? 'question' : 'questions'}. Your attempts and next review dates are
          saved.
        </p>
        <button class="primary-button" onclick={() => (started = false)}
          >Back to practice <ArrowRight size={17} /></button
        >
      {:else if current}
        <div class="session-top">
          <button class="text-button" onclick={() => (started = false)}
            ><ArrowLeft size={15} /> End session</button
          ><span>{index + 1} / {session.length}</span>
        </div>
        <div class="question-meta">
          <span class="tag">{current.prompt.kind}</span><button
            class="text-button"
            onclick={() => onopen(current.note.id)}>{current.note.title}</button
          >
        </div>
        <h2 class="question-title">{current.prompt.question}</h2>
        <label class="field-label" for="practice-answer">Your thinking</label>
        <textarea
          id="practice-answer"
          class="answer-input"
          bind:value={response}
          placeholder="Explain it in your own words…"
          disabled={revealed}></textarea>
        {#if !revealed}
          <button class="primary-button" onclick={() => (revealed = true)}
            >Reveal suggested answer <ArrowRight size={16} /></button
          >
          <p class="helper">Try to answer first, even if you’re unsure.</p>
        {:else}
          <div class="suggested-answer">
            <span class="field-label">Suggested answer · check against the source</span><Markdown
              value={current.prompt.answer}
              compact
            />
          </div>
          <p class="field-label">How did your answer compare?</p>
          <div class="rating-buttons">
            <button disabled={saving} onclick={() => rate('again')}
              >Needs another look<small>In 10 minutes</small></button
            ><button disabled={saving} onclick={() => rate('effort')}
              >With some effort<small>{effortDays} {effortDays === 1 ? 'day' : 'days'}</small
              ></button
            ><button class="positive" disabled={saving} onclick={() => rate('got-it')}
              >Got it<small>{gotItDays} days</small></button
            >
          </div>
        {/if}
        {#if error}<p role="alert" class="error-text">{error}</p>{/if}
      {/if}
    </div>
  </div>
  {#if canChat && chatOpen && current}
    {#key current}<TutorChat
        card={{ note: current.note, prompt: current.prompt, response, revealed }}
        onclose={() => toggleChat(false)}
      />{/key}
  {/if}
</div>
