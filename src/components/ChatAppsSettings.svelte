<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { CheckCircle, Copy } from 'phosphor-svelte';
  import { ui } from '../lib/ui.svelte';

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
  onMount(() => void run('claude_status'));
</script>

<div class="settings-section">
  <h3>Chat apps</h3>
  <p class="helper">
    Let Claude save notes straight into your Inbox. Ask, for example, “Save a short summary of this
    chat to Lumen.” The chat app writes the summary; Lumen only receives the note and cannot read
    your chats or library.
  </p>
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
      Run this once in a terminal. ChatGPT runs in the cloud and can’t reach Lumen directly; use
      Capture an idea → Connect ChatGPT instead.
    </p>
  {/if}
  {#if error}<p class="helper danger">{error}</p>{/if}
</div>
