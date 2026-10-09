<script lang="ts">
  import { tick } from 'svelte';
  import { Brain, CaretRight, LinkSimple, Plus, Sparkle, X } from 'phosphor-svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { headings } from '../lib/markdown';
  import { native } from '../lib/storage';
  import { questionWriter } from '../lib/questionWriter.svelte';
  import { PROVIDER_NAMES } from '../lib/tutor';
  import Select from './Select.svelte';
  import type { Note } from '../lib/types';

  let { note }: { note: Note } = $props();
  const writing = $derived(questionWriter.status[note.id]);
  const outline = $derived(headings(note.body));
  const linkedFrom = $derived(
    (library.links.backlinks.get(note.id) || [])
      .map((id) => library.get(id))
      .filter((source) => source !== undefined)
      .sort((a, b) => a.title.localeCompare(b.title)),
  );

  /** Starting to learn a note without questions asks the chat app or Ollama for some. */
  function setGoal(intent: Note['intent']) {
    const starting = note.intent === 'reference' && intent !== 'reference';
    ui.change({ intent });
    if (starting && native && !note.prompts.length) void questionWriter.write(note.id);
  }

  async function jumpTo(title: string) {
    ui.mode = 'read';
    await tick();
    const target = [
      ...document.querySelectorAll('.preview-pane h1, .preview-pane h2, .preview-pane h3'),
    ].find((el) => el.textContent === title);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

<aside class="details-panel" aria-label="Note details">
  <div class="details-heading">
    <span>IN THIS NOTE</span><button
      class="icon-button small"
      aria-label="Close note details"
      onclick={() => ui.togglePanel(false)}><X size={13} /></button
    >
  </div>
  <nav class="outline" aria-label="Document outline">
    {#each outline as heading}<button
        style={`padding-left: ${(heading.level - 1) * 9}px`}
        onclick={() => jumpTo(heading.title)}>{heading.title}</button
      >{/each}{#if !outline.length}<p class="helper">
        Add headings to give your note a little structure.
      </p>{/if}
  </nav>
  <div class="panel-section">
    <div class="panel-section-title">
      <LinkSimple size={17} />
      <h3>Linked from</h3>
    </div>
    {#if linkedFrom.length}<nav class="backlinks" aria-label="Linked from">
        {#each linkedFrom as source (source.id)}<button onclick={() => ui.show(source)}
            >{source.title || 'Untitled note'}<CaretRight size={12} /></button
          >{/each}
      </nav>{:else}<p class="helper">
        No notes link here yet. Type [[ in another note to link to this one.
      </p>{/if}
  </div>
  <div class="panel-section">
    <div class="panel-section-title">
      <Brain size={17} />
      <h3>Make it stick</h3>
    </div>
    <p class="helper">Choose what you want from this idea.</p>
    <Select
      label="Learning goal"
      value={note.intent}
      onchange={setGoal}
      options={[
        { value: 'reference', label: 'Keep as a reference' },
        { value: 'remember', label: 'Remember & explain' },
        { value: 'apply', label: 'Learn to apply' },
      ]}
    />
    {#if note.intent !== 'reference'}<div class="prompt-list">
        {#each note.prompts as prompt}<button onclick={() => ui.editQuestion(prompt)}
            ><span>{prompt.kind}</span>{prompt.question}<CaretRight size={12} /></button
          >{/each}
      </div>
      {#if writing?.writing}<p class="helper writing-questions" role="status">
          <span class="tutor-thinking-indicator" aria-hidden="true"></span>{PROVIDER_NAMES[
            writing.provider
          ]} is writing questions…
        </p>{:else if writing}<p role="alert" class="helper danger">
          Couldn’t write questions: {writing.error}
        </p>{/if}
      <button class="add-question" onclick={() => ui.editQuestion()}
        ><Plus size={14} /> Add a question</button
      >{#if native && !writing?.writing}<button
          class="add-question"
          onclick={() => questionWriter.write(note.id)}
          ><Sparkle size={14} />
          {writing
            ? 'Try again'
            : note.prompts.length
              ? 'Write more questions'
              : 'Write questions for me'}</button
        >{/if}
      <p class="helper mini">Answers stay hidden during practice.</p>{/if}
  </div>
  <div class="panel-section metadata-fields">
    <h3>Details</h3>
    <label
      >Collection<input
        value={note.collection}
        oninput={(e) => ui.change({ collection: e.currentTarget.value })}
        list="collections"
        placeholder="Personal"
      /></label
    ><label
      >Tags<input
        value={note.tags.join(', ')}
        onchange={(e) =>
          ui.change({
            tags: e.currentTarget.value
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          })}
        placeholder="Separate with commas"
      /></label
    ><label
      >Source<input
        value={note.source}
        onchange={(e) => ui.change({ source: e.currentTarget.value })}
        placeholder="Conversation or source URL"
      /></label
    >
  </div>
</aside>
