<script lang="ts">
  import { ArrowUpRight, Copy, UploadSimple } from 'phosphor-svelte';
  import Modal from '../Modal.svelte';
  import { ui } from '../../lib/ui.svelte';
  import { parseImport } from '../../lib/markdown';
  import { capturePrompt } from '../../lib/seeds';

  let tab = $state<'paste' | 'connect'>('paste');
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

<Modal title="Keep a good idea" onclose={() => ui.close()} wide
  ><p class="modal-intro">
    Bring a conversation, a question, or a small discovery into your library.
  </p>
  <div class="modal-tabs">
    <button class:chosen={tab === 'paste'} onclick={() => (tab = 'paste')}>Paste or import</button
    ><button class:chosen={tab === 'connect'} onclick={() => (tab = 'connect')}
      >Connect ChatGPT</button
    >
  </div>
  {#if tab === 'paste'}<label class="form-field"
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
      <button class="secondary-button" onclick={() => ui.importPicker?.click()}
        ><UploadSimple size={16} />Import .md files</button
      ><button class="primary-button" disabled={!text.trim() || busy} onclick={capture}
        >Save to inbox <ArrowUpRight size={16} /></button
      >
    </div>
  {:else}<div class="connection-step">
      <span class="step-number">1</span>
      <div>
        <h3>Summarize in your existing chat</h3>
        <p>
          Your ChatGPT subscription handles the summary. Copy this prompt into a conversation you
          want to keep.
        </p>
        <button class="secondary-button" onclick={() => ui.copy(capturePrompt)}
          ><Copy size={15} />Copy summary prompt</button
        >
        <details>
          <summary>View prompt</summary>
          <pre class="prompt-copy">{capturePrompt}</pre>
        </details>
      </div>
    </div>
    <div class="connection-step">
      <span class="step-number">2</span>
      <div>
        <h3>Save it here</h3>
        <p>
          Import the resulting .md file, or paste the summary into Capture. Nothing is sent to an AI
          service by Lumen.
        </p>
      </div>
    </div>
    <div class="connection-step">
      <span class="step-number">3</span>
      <div>
        <h3>Optional: connect the save tool</h3>
        <p>
          The included <code>lumen-mcp</code> companion exposes <code>save_learning_note</code>.
          Connect its stdio transport in Codex, or bridge it to ChatGPT with a private MCP tunnel.
        </p>
        <div class="code-command">
          <code>npm run mcp</code><button
            class="icon-button"
            title="Copy command"
            aria-label="Copy MCP command"
            onclick={() => ui.copy('npm run mcp')}><Copy size={15} /></button
          >
        </div>
        <p class="helper">
          Connection requires setup in your ChatGPT account. See docs/chatgpt.md in the project.
          Lumen cannot read your chat history automatically.
        </p>
      </div>
    </div>{/if}
</Modal>
