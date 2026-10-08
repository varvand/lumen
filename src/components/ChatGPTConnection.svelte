<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { CheckCircle } from 'phosphor-svelte';
  import { native } from '../lib/storage';

  interface Status {
    installed: boolean;
    connected: boolean;
    otherPath: boolean;
    serverPath: string;
  }
  let status = $state<Status>();
  let busy = $state(false);
  let error = $state('');
  let justConnected = $state(false);

  async function run(command: 'chatgpt_status' | 'connect_chatgpt' | 'disconnect_chatgpt') {
    busy = true;
    error = '';
    try {
      status = await invoke<Status>(command);
      justConnected = command === 'connect_chatgpt';
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    if (native) void run('chatgpt_status');
  });
</script>

<div class="setting-row">
  <span class="chat-app-name"
    >ChatGPT desktop
    {#if status?.connected}<span class="connected"
        ><CheckCircle size={13} weight="fill" />Connected</span
      >{/if}
  </span>
  {#if status?.connected}
    <button
      class="secondary-button"
      aria-label="Disconnect ChatGPT"
      disabled={busy}
      onclick={() => run('disconnect_chatgpt')}>Disconnect</button
    >
  {:else}
    <button
      class="primary-button"
      aria-label={status?.otherPath ? 'Reconnect ChatGPT' : 'Connect ChatGPT'}
      disabled={!native || busy || !status?.installed}
      onclick={() => run('connect_chatgpt')}>{status?.otherPath ? 'Reconnect' : 'Connect'}</button
    >
  {/if}
</div>
<p class="helper">
  Connect the ChatGPT app on this computer, then say “Send this conversation to Lumen.” The Markdown
  note arrives in Inbox.
</p>
<p class="helper mini">
  Lumen needs no API key and makes no model API calls. ChatGPT writes the note in your existing
  conversation.
</p>
{#if justConnected}
  <p class="helper" role="status">
    Restart the Lumen server in ChatGPT’s Settings → MCP servers, or restart ChatGPT, to load the
    connection. Use a local conversation with MCP tools enabled.
  </p>
{:else if status?.otherPath}
  <p class="helper">
    A different Lumen connection is configured. Reconnect to use this app and library.
  </p>
{:else if !native}
  <p class="helper">Open Lumen desktop to connect the ChatGPT app.</p>
{:else if status && !status.installed}
  <p class="helper">Install and open ChatGPT desktop once, then connect it here.</p>
{/if}
{#if error}<p class="helper danger" role="alert">{error}</p>{/if}
