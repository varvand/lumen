<script lang="ts">
  import { TextB, TextItalic, Code, Link, ListBullets, Sigma, FilePdf } from 'phosphor-svelte';
  import type Editor from './Editor.svelte';
  import { attachments } from '../lib/attachments.svelte';
  import { ui } from '../lib/ui.svelte';
  let { editor }: { editor: Editor | undefined } = $props();
</script>

<div class="format-toolbar" aria-label="Formatting">
  <button
    class="icon-button"
    aria-label="Bold"
    title="Bold (⌘ B)"
    onclick={() => editor?.format('**')}><TextB size={17} /></button
  ><button
    class="icon-button"
    aria-label="Italic"
    title="Italic (⌘ I)"
    onclick={() => editor?.format('*')}><TextItalic size={17} /></button
  ><button
    class="format-heading"
    title="Heading"
    onclick={() => editor?.format('## ', '', 'Heading')}>H₂</button
  ><span class="toolbar-divider"></span><button
    class="icon-button"
    aria-label="Insert link"
    title="Link"
    onclick={() => editor?.format('[', '](https://example.com)', 'link text')}
    ><Link size={17} /></button
  ><button
    class="icon-button"
    aria-label="Code block"
    title="Code block"
    onclick={() => editor?.format('```\n', '\n```', 'code')}><Code size={17} /></button
  ><button
    class="icon-button"
    aria-label="Bullet list"
    title="Bullet list"
    onclick={() => editor?.format('- ', '', 'List item')}><ListBullets size={17} /></button
  ><button
    class="icon-button"
    aria-label="Insert equation"
    title="LaTeX equation"
    onclick={() => editor?.format('$$\n', '\n$$', '\\sum_{i=1}^{n} x_i')}
    ><Sigma size={18} /></button
  >{#if attachments.enabled}<span class="toolbar-divider"></span><button
      class="icon-button"
      aria-label="Attach PDF"
      title="Attach a PDF"
      onclick={() => ui.attachPdf()}><FilePdf size={17} /></button
    >{/if}
</div>
