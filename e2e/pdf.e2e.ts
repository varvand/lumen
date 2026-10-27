import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PDF = 'Optics lecture.pdf';
const fixture = (name: string) => [...readFileSync(new URL(`./fixtures/${name}`, import.meta.url))];

/** The desktop app with a controlled IPC boundary and one real PDF on "disk". */
async function openApp(page: Page, { attached = false, citing = false, file = PDF } = {}) {
  const bytes = fixture(file);
  await page.addInitScript(
    ({ bytes, name, attached, citing }) => {
      const pdf = new Uint8Array(bytes);
      const win = window as unknown as {
        isTauri: boolean;
        __TAURI_INTERNALS__: unknown;
        pdfTest: {
          saved: { name: string; pages: string[] }[];
          dropped: { name: string; size: number }[];
        };
      };
      const attachment = { name, size: pdf.length, addedAt: 1 };
      const list = attached ? [attachment] : [];
      const texts: unknown[] = [];
      win.isTauri = true;
      win.pdfTest = { saved: [], dropped: [] };
      let revision = 0;
      let callback = 0;
      win.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => ++callback,
        unregisterCallback: () => {},
        invoke: async (
          command: string,
          args: Record<string, never>,
          options?: { headers?: Record<string, string> },
        ) => {
          if (command === 'load_library') {
            const notes = [...args.seeds] as { id: string; title: string; body: string }[];
            if (citing)
              notes.unshift({
                ...notes[0],
                id: 'optics-notes',
                title: 'Optics notes',
                body: `Slides: ![[${name}]]`,
                pinned: false,
              } as never);
            return { notes, attempts: [], path: '/test/library' };
          }
          if (command === 'save_note')
            return { ...(args.note as object), updatedAt: Date.now(), revision: ++revision };
          if (command === 'list_attachments') return list;
          if (command === 'plugin:dialog|open') return `/Users/test/Downloads/${name}`;
          if (command === 'add_attachment') {
            if (!list.length) list.push(attachment);
            return attachment;
          }
          if (command === 'add_attachment_bytes') {
            const bytes = args as unknown as Uint8Array;
            win.pdfTest.dropped.push({
              name: decodeURIComponent(options?.headers?.name ?? ''),
              size: bytes.length,
            });
            if (!list.length) list.push(attachment);
            return attachment;
          }
          if (command === 'read_attachment') return pdf.slice().buffer;
          if (command === 'pdf_texts') return texts;
          if (command === 'save_pdf_text') {
            texts.push(args.text);
            win.pdfTest.saved.push(args.text);
            return null;
          }
          if (command === 'assistant_providers') return [];
          if (command === 'claude_status')
            return { installed: false, connected: false, otherPath: false, serverPath: '' };
          if (command === 'app_version') return { version: '0.1.0' };
          return null;
        },
      };
    },
    { bytes, name: file, attached, citing },
  );
  await page.goto('/');
}

/** Select the text of the first span on a page that contains the words, like a drag would. */
async function selectText(page: Page, pageNumber: number, words: string) {
  const span = page
    .locator(`.pdf-page[data-page="${pageNumber}"] .textLayer span`)
    .filter({ hasText: words })
    .first();
  await expect(span).toBeVisible();
  await span.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
}

test('attaches a PDF, quotes a selection with its page, and follows the quote back', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill('Refraction');
  const editor = page.getByRole('textbox', { name: 'Markdown editor' });
  await editor.click();
  await page.keyboard.insertText('Notes from the lecture.');

  await page.getByRole('button', { name: 'Attach PDF' }).click();
  await expect(editor).toContainText(`![[${PDF}]]`);
  const reader = page.getByRole('complementary', { name: 'PDF reader' });
  await expect(reader.getByTitle(PDF)).toBeVisible();
  await expect(reader.getByRole('region', { name: 'Page 2' })).toBeAttached();
  await expect(reader.getByText('1 / 2')).toBeVisible();

  await selectText(page, 2, 'Light stays inside');
  await reader.getByRole('button', { name: 'Quote in note' }).click();
  // The editor renders the quote in place, so its > markers only show on the cursor's line.
  await expect(editor).toContainText('Light stays inside the core when it meets the boundary');
  await expect(editor).toContainText(`— [[${PDF}#page=2|Optics lecture, p. 2]]`);
  await expect(page.getByText('Quoted page 2')).toBeVisible();

  // In the rendered note, the embed opens the PDF and the quote's link opens its page.
  await reader.getByRole('button', { name: 'Close PDF' }).click();
  await expect(reader).toBeHidden();
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const preview = page.locator('.preview-pane');
  await expect(preview.locator('a.pdf-embed')).toHaveText(PDF);
  await expect(preview.locator('blockquote')).toContainText(
    'Light stays inside the core when it meets the boundary',
  );
  await preview.getByRole('link', { name: 'Optics lecture, p. 2' }).click();
  await expect(reader.getByText('2 / 2')).toBeVisible();
});

test('finds words inside PDFs and shows them in the graph, unless PDFs are turned off', async ({
  page,
}) => {
  await openApp(page, { attached: true, citing: true });
  // The PDF's text is read once, locally, and saved for next time.
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as never as { pdfTest: { saved: unknown[] } }).pdfTest.saved.length,
      ),
    )
    .toBe(1);

  await page.keyboard.press('ControlOrMeta+k');
  const search = page.getByRole('textbox', { name: 'Search your library' });
  await search.fill('critical angle');
  const result = page.getByRole('button', { name: /Optics lecture\.pdf · p\. 2/ });
  await expect(result).toContainText('at more than the critical angle');
  await result.click();
  const reader = page.getByRole('complementary', { name: 'PDF reader' });
  await expect(reader.getByText('2 / 2')).toBeVisible();

  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  const graph = page.getByRole('group', { name: 'Note graph' });
  const node = graph.getByRole('button', { name: `${PDF} (PDF)` });
  await expect(node).toBeVisible();
  await expect(page.locator('.page-top .subtle')).toHaveText(/^\d+ notes · 1 PDF · \d+ links?$/);

  // One switch takes PDFs out of both the graph and search.
  await page.getByRole('checkbox', { name: 'PDFs' }).uncheck();
  await expect(node).toBeHidden();
  await page.keyboard.press('ControlOrMeta+k');
  await search.fill('critical angle');
  await expect(page.getByRole('button', { name: /Optics lecture\.pdf/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(
    page.getByRole('switch', { name: 'Include PDFs in search and the graph' }),
  ).not.toBeChecked();
});

test('draws images that need PDF.js decoders, under the desktop app security policy', async ({
  page,
}) => {
  // Serve the page with the desktop app's Content-Security-Policy, so blocked decoders fail here.
  const { csp } = JSON.parse(
    readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  ).app.security;
  await page.route('/', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': csp },
    });
  });
  const blocked: string[] = [];
  page.on('console', (message) => {
    if (/wasm|Content Security Policy|failed to initialize/i.test(message.text()))
      blocked.push(message.text());
  });
  const file = 'JPEG 2000 image.pdf';
  await openApp(page, { attached: true, citing: true, file });
  await page.getByRole('button', { name: 'Optics notes' }).click();
  await page.locator('.preview-pane a.pdf-embed').click();
  const canvas = page.locator('.pdf-page[data-page="1"] canvas');
  await expect(canvas).toBeVisible();
  // The page is white except for a red JPEG 2000 square in its middle.
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) => {
        const [r, g, b] = element
          .getContext('2d')!
          .getImageData(element.width / 2, element.height / 2, 1, 1).data;
        return r > 150 && g < 90 && b < 90;
      }),
    )
    .toBe(true);
  expect(blocked).toEqual([]);
});

/** Drop files on the editor at the middle of a line, as dragging from Finder would. */
async function dropFiles(
  page: Page,
  files: { name: string; type: string; bytes: number[] }[],
  line: number,
  { release = true } = {},
) {
  const target = page
    .getByRole('textbox', { name: 'Markdown editor' })
    .locator('.cm-line')
    .nth(line);
  const box = (await target.boundingBox())!;
  await page.evaluate(
    ({ files, x, y, release }) => {
      const transfer = new DataTransfer();
      for (const f of files)
        transfer.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.type }));
      const at = document.elementFromPoint(x, y)!;
      const fire = (type: string) =>
        at.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
            clientX: x,
            clientY: y,
          }),
        );
      fire('dragenter');
      fire('dragover');
      if (release) fire('drop');
    },
    { files, x: box.x + 4, y: box.y + box.height / 2, release },
  );
}

async function writeThreeParagraphs(page: Page) {
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill('Dropping');
  const editor = page.getByRole('textbox', { name: 'Markdown editor' });
  await editor.click();
  await page.keyboard.insertText('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.');
  return editor;
}

const pdfFile = () => ({ name: PDF, type: 'application/pdf', bytes: fixture(PDF) });

test('drops a PDF onto a note and embeds it where it landed, like the Attach button', async ({
  page,
}) => {
  await openApp(page);
  const editor = await writeThreeParagraphs(page);

  // While a PDF is dragged over the note, the note shows where it will go.
  await dropFiles(page, [pdfFile()], 2, { release: false });
  await expect(editor.locator('xpath=ancestor::div[contains(@class,"cm-editor")]')).toHaveClass(
    /cm-pdf-drop/,
  );

  await dropFiles(page, [pdfFile()], 2);
  await expect(editor.locator('xpath=ancestor::div[contains(@class,"cm-editor")]')).not.toHaveClass(
    /cm-pdf-drop/,
  );
  // The embed lands after the second paragraph, between it and the third.
  await expect(editor).toContainText(`![[${PDF}]]`);
  expect(((await editor.innerText()).match(/\S[^\n]*/g) ?? []).filter(Boolean)).toEqual([
    'First paragraph.',
    'Second paragraph.',
    `![[${PDF}]]`,
    'Third paragraph.',
  ]);
  // The bytes went to the library under the file's name, and the reader opened like the button does.
  expect(
    await page.evaluate(
      () => (window as never as { pdfTest: { dropped: unknown[] } }).pdfTest.dropped,
    ),
  ).toEqual([{ name: PDF, size: fixture(PDF).length }]);
  const reader = page.getByRole('complementary', { name: 'PDF reader' });
  await expect(reader.getByTitle(PDF)).toBeVisible();
  await expect(page.getByText(`Added ${PDF}`)).toBeVisible();
});

test('ignores dropped files that are not PDFs and keeps dragging text inside the note', async ({
  page,
}) => {
  await openApp(page);
  const editor = await writeThreeParagraphs(page);
  await dropFiles(page, [{ name: 'photo.png', type: 'image/png', bytes: [1, 2, 3] }], 0);
  await expect(editor).not.toContainText('![[');
  expect(
    await page.evaluate(
      () => (window as never as { pdfTest: { dropped: unknown[] } }).pdfTest.dropped,
    ),
  ).toEqual([]);
  await expect(page.getByRole('complementary', { name: 'PDF reader' })).toHaveCount(0);

  // Text dragged within the note is still the editor's to place.
  const last = (await editor.locator('.cm-line').last().boundingBox())!;
  await page.evaluate(
    ({ x, y }) => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'MOVED TEXT');
      const at = document.elementFromPoint(x, y)!;
      for (const type of ['dragover', 'drop'])
        at.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
            clientX: x,
            clientY: y,
          }),
        );
    },
    { x: last.x + 4, y: last.y + last.height / 2 },
  );
  await expect(editor).toContainText('MOVED TEXT');
  await expect(editor).not.toContainText('![[');
});

test('tells the browser build that PDFs attach in the desktop app, instead of opening the file', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New note' }).click();
  const editor = page.getByRole('textbox', { name: 'Markdown editor' });
  await editor.click();
  await page.keyboard.insertText('Plain note.');
  const url = page.url();
  await dropFiles(page, [pdfFile()], 0);
  await expect(page.getByText('PDFs can be attached in the desktop app.')).toBeVisible();
  await expect(editor).not.toContainText('![[');
  expect(page.url()).toBe(url);
});
