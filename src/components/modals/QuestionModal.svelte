<script lang="ts">
  import { Check, Trash } from 'phosphor-svelte';
  import Select from '../Select.svelte';
  import Modal from '../Modal.svelte';
  import { ui } from '../../lib/ui.svelte';
  import type { Note, Prompt } from '../../lib/types';

  let { note }: { note: Note } = $props();
  // The dialog edits a copy; the note changes only on save or remove.
  let draft = $state<Prompt>(
    ui.editingPrompt
      ? { ...ui.editingPrompt }
      : { id: crypto.randomUUID(), kind: 'recall', question: '', answer: '' },
  );
  const existing = $derived(note.prompts.some((p) => p.id === draft.id));
  const valid = $derived(!!draft.question.trim() && !!draft.answer.trim());

  async function save() {
    if (!valid) return;
    ui.change({
      prompts: [
        ...note.prompts.filter((p) => p.id !== draft.id),
        { ...draft, question: draft.question.trim(), answer: draft.answer.trim() },
      ],
    });
    await ui.afterSave(() => {
      ui.close();
      ui.notify('Practice question saved');
    });
  }
  function remove() {
    ui.change({ prompts: note.prompts.filter((p) => p.id !== draft.id) });
    ui.close();
  }
</script>

<Modal title={existing ? 'Edit question' : 'New question'} onclose={() => ui.close()}
  ><div class="form-field">
    Activity<Select
      label="Activity"
      bind:value={draft.kind}
      options={[
        { value: 'recall', label: 'Recall · reconstruct the idea' },
        { value: 'explain', label: 'Explain · understand why' },
        { value: 'apply', label: 'Apply · try a new situation' },
      ]}
    />
  </div>
  <label class="form-field"
    >Question<textarea
      rows="3"
      bind:value={draft.question}
      placeholder="What would you ask your future self?"></textarea></label
  ><label class="form-field"
    >Suggested answer<textarea
      rows="5"
      bind:value={draft.answer}
      placeholder="Key points to check after your attempt. Markdown and math work here, too."
    ></textarea></label
  >
  <div class="modal-footer">
    {#if existing}<button class="text-button danger" onclick={remove}
        ><Trash size={15} />Remove question</button
      >{:else}<span></span>{/if}<button class="primary-button" disabled={!valid} onclick={save}
      >Save question <Check size={16} /></button
    >
  </div></Modal
>
