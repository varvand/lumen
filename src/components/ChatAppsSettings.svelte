<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { CheckCircle, Copy } from 'phosphor-svelte';
  import { ui } from '../lib/ui.svelte';
  import { native } from '../lib/storage';
  import { capturePrompt } from '../lib/seeds';
  import ChatGPTConnection from './ChatGPTConnection.svelte';

  interface ClaudeStatus {
    installed: boolean;
    connected: boolean;
    otherPath: boolean;
    serverPath: string;
  }
  let status = $state<ClaudeStatus | null>(null);
  let busy = $state(false);
  let error = $state('');
  let justConnected = $state(false);
  const claudeCode = $derived(
    status ? `claude mcp add --scope user lumen -- "${status.serverPath}"` : '',
  );

  async function run(command: 'claude_status' | 'connect_claude' | 'disconnect_claude') {
    busy = true;
    error = '';
    try {
      status = await invoke<ClaudeStatus>(command);
      justConnected = command === 'connect_claude';
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }
  onMount(() => {
    if (native) void run('claude_status');
  });
</script>

<div class="settings-section">
  <h3>Chat apps</h3>
  <p class="helper">
    The chat app writes the summary. The connection can add notes to Inbox; it cannot read your
    other notes or chat history.
  </p>
  <ChatGPTConnection />
  <span class="chat-app-name">Manual Markdown import</span>
  <p class="helper">
    Paste this prompt into a conversation you want to keep, then paste the reply into Capture or
    import the .md file it gives you.
  </p>
  <div class="library-actions">
    <button class="secondary-button" onclick={() => ui.copy(capturePrompt)}
      ><Copy size={15} />Copy summary prompt</button
    >
  </div>
  <details class="chat-app-details" open={ui.isExpanded('settings:prompt', false)}>
    <summary
      onclick={(e) => {
        e.preventDefault();
        ui.setExpanded('settings:prompt', !ui.isExpanded('settings:prompt', false));
      }}>View prompt</summary
    >
    <pre class="prompt-copy">{capturePrompt}</pre>
  </details>
  <details class="chat-app-details" open={ui.isExpanded('settings:connection', false)}>
    <summary
      onclick={(e) => {
        e.preventDefault();
        ui.setExpanded('settings:connection', !ui.isExpanded('settings:connection', false));
      }}>Advanced: connect the save tool</summary
    >
    <p class="helper">
      For other local MCP clients, register the bundled companion as a stdio server using this
      executable path. It exposes the <code>save_note</code> tool.
    </p>
    <div class="code-command">
      <code>{status?.serverPath || 'Open Lumen desktop to find the bundled companion'}</code><button
        class="icon-button"
        title="Copy command"
        aria-label="Copy MCP command"
        disabled={!status?.serverPath}
        onclick={() => ui.copy(status?.serverPath || '')}><Copy size={15} /></button
      >
    </div>
  </details>
  {#if status}
    <div class="setting-row">
      <span class="chat-app-name"
        >Claude Desktop
        {#if status.connected}<span class="connected"
            ><CheckCircle size={13} weight="fill" />Connected</span
          >{/if}</span
      >
      {#if status.connected}<button
          class="secondary-button"
          disabled={busy}
          onclick={() => run('disconnect_claude')}>Disconnect</button
        >{:else}<button
          class="primary-button"
          disabled={busy || !status.installed}
          onclick={() => run('connect_claude')}>{status.otherPath ? 'Reconnect' : 'Connect'}</button
        >{/if}
    </div>
    <p class="helper">
      {#if !status.installed}Claude Desktop isn’t installed on this Mac.{:else if justConnected}Quit
        and reopen Claude Desktop to load Lumen.{:else if status.otherPath}Claude is set up with a
        different copy of Lumen. Reconnect to use this one.{/if}
    </p>
    <span class="chat-app-name">Claude Code</span>
    <div class="code-command">
      <code>{claudeCode}</code><button
        class="icon-button"
        title="Copy command"
        aria-label="Copy Claude Code command"
        onclick={() => ui.copy(claudeCode)}><Copy size={15} /></button
      >
    </div>
    <p class="helper">
      Run this once in a terminal. Then ask, for example, “Save a short summary of this chat to
      Lumen.”
    </p>
  {/if}
  {#if error}<p class="helper danger">{error}</p>{/if}
</div>
