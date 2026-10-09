import { invoke } from '@tauri-apps/api/core';
import { native } from './storage';
import { preferences } from './preferences.svelte';
import type { Attachment, PdfText } from './types';

/** PDFs kept open at once; reopening a recent one skips reading it from disk. */
const CACHED = 3;

/**
 * PDFs in the library's attachments folder (desktop only), and the text read from them
 * for search. Text is read on this computer with PDF.js and cached by the library.
 */
class Attachments {
  list = $state<Attachment[]>([]);
  texts = $state.raw<PdfText[]>([]);
  /** Name of the PDF whose text is being read, if any. */
  indexing = $state('');
  error = $state('');
  /** PDFs by lowercased name, matching link keys. */
  byKey = $derived(new Map(this.list.map((a) => [a.name.toLowerCase(), a])));

  #bytes = new Map<string, Promise<Uint8Array>>();
  #indexRun: Promise<void> | undefined;

  get enabled() {
    return native;
  }
  get(name: string) {
    return this.byKey.get(name.trim().toLowerCase());
  }
  async load() {
    if (!native) return;
    try {
      const [list, texts] = await Promise.all([
        invoke<Attachment[]>('list_attachments'),
        invoke<PdfText[]>('pdf_texts'),
      ]);
      this.list = Array.isArray(list) ? list : [];
      this.texts = Array.isArray(texts) ? texts : [];
      this.error = '';
    } catch (e) {
      this.error = String(e);
      return;
    }
    if (preferences.pdfIndex) void this.index();
  }
  /** Ask for PDFs and copy them into the library. Returns the PDFs as they were saved. */
  async pick(): Promise<Attachment[]> {
    if (!native) return [];
    const { open } = await import('@tauri-apps/plugin-dialog');
    const chosen = await open({
      multiple: true,
      directory: false,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    const paths = chosen === null ? [] : Array.isArray(chosen) ? chosen : [chosen];
    const added: Attachment[] = [];
    for (const path of paths) added.push(await invoke<Attachment>('add_attachment', { path }));
    if (added.length) await this.load();
    return added;
  }
  /** A PDF's bytes, from the few most recently opened or from disk. */
  bytes(name: string) {
    let pending = this.#bytes.get(name);
    if (!pending) {
      pending = invoke<ArrayBuffer>('read_attachment', { name }).then((b) => new Uint8Array(b));
      pending.catch(() => this.#bytes.delete(name));
      this.#bytes.set(name, pending);
      for (const key of [...this.#bytes.keys()].slice(0, -CACHED)) this.#bytes.delete(key);
    }
    return pending;
  }
  /** Read the text of PDFs added or changed since they were last read, one at a time. */
  index() {
    this.#indexRun ??= this.#index().finally(() => (this.#indexRun = undefined));
    return this.#indexRun;
  }
  async #index() {
    const { closePdf, openPdf, pageTexts } = await import('./pdfjs');
    for (;;) {
      if (!preferences.pdfIndex) return;
      const next = this.list.find(
        (a) => !this.texts.some((t) => t.name === a.name && t.size === a.size),
      );
      if (!next) return;
      this.indexing = next.name;
      let text: PdfText = { name: next.name, size: next.size, pages: [] };
      try {
        const doc = await openPdf(await this.bytes(next.name));
        try {
          text = { ...text, pages: await pageTexts(doc) };
        } finally {
          closePdf(doc);
        }
        await invoke('save_pdf_text', { text });
      } catch {
        // An unreadable PDF is skipped until it changes, instead of being retried forever.
      }
      this.texts = [...this.texts.filter((t) => t.name !== next.name), text];
      this.indexing = '';
    }
  }
}

export const attachments = new Attachments();
