<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { FolderOpen, CheckCircle } from 'phosphor-svelte';
  import Modal from '../Modal.svelte';
  import { library } from '../../lib/library.svelte';
  import { ui } from '../../lib/ui.svelte';
  import { native } from '../../lib/storage';
  import { isHiddenPath, planImport, type VaultFile } from '../../lib/obsidian';

  interface Folder {
    name: string;
    files: VaultFile[];
    skipped: string[];
    otherFiles: number;
  }
  interface Result {
    imported: number;
    collections: number;
    alreadyImported: number;
    attachments: number;
    skipped: string[];
    failed: { title: string; reason: string }[];
  }

  let phase = $state<'choose' | 'importing' | 'done'>('choose');
  let total = $state(0);
  let done = $state(0);
  let error = $state('');
  let result = $state<Result | null>(null);
  let picker = $state<HTMLInputElement>();

  async function chooseFolder() {
    error = '';
    if (!native) return picker?.click();
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ directory: true, title: 'Choose your Obsidian vault' });
    if (typeof path !== 'string') return;
    try {
      await run(await invoke<Folder>('read_markdown_folder', { path }));
    } catch (e) {
      fail(e);
    }
  }

  /** The browser preview reads the folder through a directory picker. */
  async function readPicked() {
    if (!picker) return;
    const picked = Array.from(picker.files || []);
    picker.value = '';
    if (!picked.length) return;
    const folder: Folder = { name: '', files: [], skipped: [], otherFiles: 0 };
    for (const file of picked) {
      const [name, ...rest] = file.webkitRelativePath.split('/');
      const path = rest.join('/');
      folder.name ||= name;
      if (isHiddenPath(path)) continue;
      if (!/\.md$/i.test(path)) folder.otherFiles++;
      else if (file.size > 2_000_000) folder.skipped.push(path);
      else folder.files.push({ path, text: await file.text(), modified: file.lastModified });
    }
    try {
      await run(folder);
    } catch (e) {
      fail(e);
    }
  }

  async function run(folder: Folder) {
    if (!folder.files.length) {
      error = 'No Markdown notes were found in that folder.';
      return;
    }
    phase = 'importing';
    const plan = await planImport(folder.name, folder.files, (id) => !!library.get(id));
    total = plan.notes.length;
    done = 0;
    const failed = await library.importNotes(plan.notes, (n) => (done = n));
    const saved = plan.notes.filter((n) => !failed.some((f) => f.id === n.id));
    result = {
      imported: saved.length,
      collections: new Set(saved.map((n) => n.collection)).size,
      alreadyImported: plan.alreadyImported,
      // Attachment files in the vault; each reference to one is marked in its note.
      attachments: folder.otherFiles,
      skipped: [...folder.skipped, ...plan.failed.map((f) => `${f.path} (${f.reason})`)],
      failed,
    };
    phase = 'done';
  }
  function fail(e: unknown) {
    phase = 'choose';
    error = `The vault could not be imported: ${String(e)}`;
  }
  async function showNotes() {
    ui.close();
    await ui.browse('library');
  }
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<Modal
  title="Import from Obsidian"
  onclose={() => {
    if (phase !== 'importing') ui.close();
  }}
>
  <div class="obsidian-import">
    {#if phase === 'choose'}
      <p class="modal-intro">
        Bring a whole vault into your library. Your Obsidian files are only read, never changed.
      </p>
      <ul class="import-mapping">
        <li><strong>Folders</strong> become collections, like “Physics / Waves”.</li>
        <li><strong>Tags</strong> from properties and #tags in the text are kept.</li>
        <li>
          <strong>[[Links]]</strong> become plain text, and callouts become quotes. Images and other attachments
          are not imported yet; a note marks where each one was.
        </li>
        <li><strong>Importing again</strong> adds only notes that are new since last time.</li>
      </ul>
      <input
        bind:this={picker}
        type="file"
        webkitdirectory
        hidden
        aria-label="Vault folder"
        onchange={readPicked}
      />
      {#if error}<p class="helper danger">{error}</p>{/if}
      <div class="modal-footer">
        <button class="primary-button" onclick={chooseFolder}
          ><FolderOpen size={16} />Choose vault folder</button
        >
      </div>
    {:else if phase === 'importing'}
      <p class="modal-intro">Importing {done} of {total} notes…</p>
      <progress max={total || 1} value={done} aria-label="Import progress"></progress>
    {:else if result}
      <p class="import-done">
        <CheckCircle size={20} weight="fill" />
        {result.imported
          ? `Imported ${plural(result.imported, 'note')} into ${plural(result.collections, 'collection')}.`
          : 'No new notes to import.'}
      </p>
      <ul class="import-mapping">
        {#if result.alreadyImported}<li>
            {plural(result.alreadyImported, 'note')}
            {result.alreadyImported === 1 ? 'was' : 'were'} already in Lumen and left as they are.
          </li>{/if}
        {#if result.attachments}<li>
            {plural(result.attachments, 'attachment')} (images, PDFs, other files)
            {result.attachments === 1 ? 'wasn’t' : 'weren’t'} imported.
          </li>{/if}
        {#if result.skipped.length}<li>
            Skipped {plural(result.skipped.length, 'file')}: {result.skipped
              .slice(0, 5)
              .join(', ')}{result.skipped.length > 5 ? '…' : ''}
          </li>{/if}
        {#each result.failed.slice(0, 5) as item}<li class="danger">
            {item.title}: {item.reason}
          </li>{/each}
      </ul>
      <div class="modal-footer">
        <button class="secondary-button" onclick={() => ui.close()}>Close</button>
        {#if result.imported}<button class="primary-button" onclick={showNotes}>Show notes</button
          >{/if}
      </div>
    {/if}
  </div>
</Modal>
