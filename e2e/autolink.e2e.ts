import { expect, test } from '@playwright/test';

/** Suggest links through a controlled IPC boundary; no subscription calls. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const win = window as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: unknown;
      linkTest: { calls: { prompt: string; effort: string }[]; answer: string };
    };
    win.isTauri = true;
    win.linkTest = { calls: [], answer: '1 2\n3 -> 1\nnot a link' };
    let callback = 0;
    win.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: () => ++callback,
      unregisterCallback: () => {},
      invoke: async (
        command: string,
        args: { seeds: unknown[]; prompt: string; effort: string },
      ) => {
        if (command === 'load_library')
          return { notes: args.seeds, attempts: [], path: '/test/library' };
        if (command === 'save_note') return { ...(args as never as { note: object }).note };
        if (command === 'assistant_providers') return ['claude'];
        if (command === 'ask_assistant') {
          win.linkTest.calls.push(args);
          await new Promise((resolve) => setTimeout(resolve, 300));
          return win.linkTest.answer;
        }
        if (command === 'claude_status')
          return { installed: false, connected: false, otherPath: false, serverPath: '' };
        if (command === 'app_version') return { version: '0.1.0' };
        return null;
      },
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Graph' }).click();
});

test('suggests links from short digests of unlinked notes and adds the chosen ones', async ({
  page,
}) => {
  const suggest = page.getByRole('button', { name: 'Suggest links' });
  await suggest.click();
  await expect(page.getByRole('button', { name: 'Asking Claude…' })).toBeDisabled();

  const panel = page.getByRole('region', { name: 'Suggested links' });
  await expect(panel.getByRole('heading')).toHaveText('2 suggested links');
  const [call] = await page.evaluate(
    () =>
      (window as never as { linkTest: { calls: { prompt: string; effort: string }[] } }).linkTest
        .calls,
  );
  expect(call.effort).toBe('light');
  expect(call.prompt).toContain('NEW\n1 | ');
  // Each note is sent as a short digest, never in full.
  expect(call.prompt.length).toBeLessThan(2000);

  // Dismissed suggestions come back on the next click, without asking again.
  await panel.getByRole('button', { name: 'Not now' }).click();
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Graph' }).click();
  await expect(suggest).toContainText('2');
  await suggest.click();
  await expect(panel.getByRole('heading')).toHaveText('2 suggested links');
  expect(
    await page.evaluate(
      () => (window as never as { linkTest: { calls: unknown[] } }).linkTest.calls.length,
    ),
  ).toBe(1);

  await panel.getByRole('checkbox').nth(1).uncheck();
  await panel.getByRole('button', { name: 'Add links' }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByText('· 1 link', { exact: false })).toBeVisible();

  // Checked notes are not sent again until they change.
  await suggest.click();
  await expect(page.getByText('Every note is linked or has already been checked.')).toBeVisible();
});
