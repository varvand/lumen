<script lang="ts">
  import { ArrowUpRight, UploadSimple } from 'phosphor-svelte';
  import Modal from '../Modal.svelte';
  import { ui } from '../../lib/ui.svelte';
  import { parseImport } from '../../lib/markdown';
  import { capturePrompt } from '../../lib/seeds';

  let text = $state('');
  let title = $state('');
  let busy = $state(false);

  async function capture() {
    if (!text.trim() || busy) return;
    busy = true;
    try {
      const parsed = parseImport(text, title || 'Conversation note');
      const note = await ui.createNote({
        ...parsed,
        title: title.trim() || parsed.title,
        inbox: true,
        collection: 'From ChatGPT',
      });
      if (note) {
        ui.close();
        ui.notify('Saved to your inbox');
      }
    } finally {
      busy = false;
    }
  }
</script>

<Modal title="Capture" onclose={() => ui.close()} wide
  ><p class="modal-intro">
    Bring a conversation, a question, or a small discovery into your library. Summarizing a ChatGPT
    chat? <button class="text-button accent inline" onclick={() => ui.copy(capturePrompt)}
      >Copy the summary prompt</button
    >
  </p>
  <label class="form-field"
    >Title <span class="optional">optional if your Markdown has a heading</span><input
      bind:value={title}
      placeholder="What did you learn?"
    /></label
  ><label class="form-field"
    >Markdown<textarea
      class="capture-textarea"
      bind:value={text}
      placeholder="Paste a summary from your conversation…"></textarea></label
  >
  <div class="modal-footer">
    <div class="library-actions">
      <button class="secondary-button" onclick={() => ui.importPicker?.click()}
        ><UploadSimple size={16} />Import .md files</button
      ><button class="secondary-button" onclick={() => ui.open('obsidian')}>Obsidian vault</button>
    </div>
    <button class="primary-button" disabled={!text.trim() || busy} onclick={capture}
      >Save to inbox <ArrowUpRight size={16} /></button
    >
  </div>
</Modal>
