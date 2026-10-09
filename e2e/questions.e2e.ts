import { expect, test, type Page } from '@playwright/test';

/** A desktop app with a controlled IPC boundary: Claude Code and Ollama, no real model calls. */
async function openApp(page: Page) {
  await page.addInitScript(() => {
    const win = window as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: unknown;
      llm: {
        reply: string;
        failure: string;
        calls: { provider: string; prompt: string; model?: string }[];
      };
    };
    win.isTauri = true;
    win.llm = {
      reply:
        'Sure:\n```json\n[{"kind": "recall", "question": "What do plants make from light?", "answer": "Glucose."}, {"kind": "explain", "question": "Why do leaves look green?", "answer": "They reflect green light."}]\n```',
      failure: '',
      calls: [],
    };
    let revision = 0;
    let callback = 0;
    win.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: () => ++callback,
      unregisterCallback: () => {},
      invoke: async (
        command: string,
        args: { seeds: unknown[]; note: object; provider: string; prompt: string; model?: string },
      ) => {
        if (command === 'load_library')
          return { notes: args.seeds, attempts: [], path: '/test/library' };
        if (command === 'save_note')
          return { ...args.note, updatedAt: Date.now(), revision: ++revision };
        if (command === 'assistant_providers') return ['claude', 'ollama'];
        if (command === 'ollama_models') return ['gemma3:4b', 'qwen3:8b'];
        if (command === 'ask_assistant') {
          win.llm.calls.push(args);
          await new Promise((resolve) => setTimeout(resolve, 300));
          if (win.llm.failure) throw win.llm.failure;
          return win.llm.reply;
        }
        if (command === 'claude_status')
          return { installed: false, connected: false, otherPath: false, serverPath: '' };
        if (command === 'app_version') return { version: '0.1.0' };
        return null;
      },
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill('Photosynthesis');
}

async function chooseGoal(page: Page, goal: string) {
  await page.getByRole('combobox', { name: 'Learning goal' }).click();
  await page.getByRole('option', { name: goal }).click();
}

test('writes practice questions with the chosen Ollama model when a note becomes something to learn', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('combobox', { name: 'Assistant' }).click();
  await settings.getByRole('option', { name: 'Ollama' }).click();
  await settings.getByRole('combobox', { name: 'Ollama model' }).click();
  await settings.getByRole('option', { name: 'qwen3:8b' }).click();
  await page.keyboard.press('Escape');

  await chooseGoal(page, 'Remember & explain');
  await expect(
    page.getByRole('status').filter({ hasText: 'Ollama is writing questions…' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'recall What do plants make from light?' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'explain Why do leaves look green?' }),
  ).toBeVisible();
  const calls = await page.evaluate(() => (window as any).llm.calls);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ provider: 'ollama', model: 'qwen3:8b' });
  expect(calls[0].prompt).toContain('<note title="Photosynthesis">');

  // Notes that already have questions keep them; switching back and forth asks again only on request.
  await chooseGoal(page, 'Keep as a reference');
  await chooseGoal(page, 'Learn to apply');
  await expect(page.getByRole('button', { name: 'Write more questions' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).llm.calls.length)).toBe(1);
});

test('explains a failed run and tries again', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => ((window as any).llm.failure = 'Not logged in'));
  await chooseGoal(page, 'Remember & explain');
  await expect(page.getByRole('alert')).toHaveText('Couldn’t write questions: Not logged in');
  await page.evaluate(() => ((window as any).llm.failure = ''));
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('button', { name: 'recall What do plants make from light?' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
