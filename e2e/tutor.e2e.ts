import { expect, test, type Page } from '@playwright/test';

/** Exercise the desktop-only chat with a controlled IPC boundary; no subscription calls. */
async function openChat(page: Page, providers = ['claude', 'codex']) {
  await page.addInitScript(
    ({ providers }) => {
      const win = window as unknown as {
        isTauri: boolean;
        __TAURI_INTERNALS__: unknown;
        chatTest: {
          providers: string[];
          failure: boolean;
          delay: number;
          calls: { provider: string; prompt: string }[];
        };
      };
      win.isTauri = true;
      win.chatTest = { providers, failure: false, delay: 500, calls: [] };
      let callback = 0;
      win.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => ++callback,
        unregisterCallback: () => {},
        invoke: async (
          command: string,
          args: { seeds: unknown[]; provider: string; prompt: string },
        ) => {
          if (command === 'load_library')
            return { notes: args.seeds, attempts: [], path: '/test/library' };
          if (command === 'assistant_providers') return win.chatTest.providers;
          if (command === 'ask_assistant') {
            win.chatTest.calls.push(args);
            await new Promise((resolve) => setTimeout(resolve, win.chatTest.delay));
            if (win.chatTest.failure) throw new Error('The chat app could not connect. Try again.');
            return '## Start with the main idea\n\nTry explaining it in **your own words**.\n\n- Identify the cause.\n- Connect it to the result.';
          }
          if (command === 'claude_status')
            return { installed: false, connected: false, otherPath: false, serverPath: '' };
          if (command === 'app_version') return { version: '0.1.0' };
          return null;
        },
      };
      localStorage.setItem('lumen.tutor.open', 'true');
    },
    { providers },
  );
  await page.goto('/');
  await page.getByRole('button', { name: /^Practice/ }).click();
  await page.getByRole('button', { name: 'Start a short session' }).click();
  await expect(page.getByRole('complementary', { name: 'Ask about this card' })).toBeVisible();
}

test('sends suggestions and follow-ups, renders replies, and restores focus', async ({
  page,
}, testInfo) => {
  await openChat(page);
  const chat = page.getByRole('complementary', { name: 'Ask about this card' });
  await expect(chat.getByText('Current note', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('chat-light.png') });
  await chat.getByRole('button', { name: 'Give me a hint' }).click();
  await expect(chat.getByRole('status')).toContainText('Claude is thinking');
  await expect(chat.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled();
  await expect(chat.getByRole('heading', { name: 'Start with the main idea' })).toBeVisible();
  const input = chat.getByRole('textbox', { name: 'Your question' });
  await expect(input).toBeFocused();
  await chat.getByRole('combobox', { name: 'Chat app' }).click();
  await page.getByRole('option', { name: 'ChatGPT', exact: true }).click();
  await input.fill('Can you explain the cause?');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('Can you explain the cause?\n');
  await input.press('Enter');
  await expect(chat.getByRole('log')).toContainText('Can you explain the cause?');
  await expect(chat.locator('.tutor-answer')).toHaveCount(2);
  await expect(chat.locator('.tutor-answer').last().locator('.tutor-message-label')).toHaveText(
    'ChatGPT',
  );
  await expect(chat.locator('.tutor-answer').first().locator('.tutor-message-label')).toHaveText(
    'Claude',
  );
  await page.screenshot({ path: testInfo.outputPath('chat-conversation.png') });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect
    .poll(() =>
      page.locator('.search-trigger').evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe('rgb(27, 32, 29)');
  await page.screenshot({ path: testInfo.outputPath('chat-dark.png') });
});

test('restores the question after a failed request and lets the user retry', async ({ page }) => {
  await openChat(page);
  await page.evaluate(() => {
    (window as unknown as { chatTest: { failure: boolean } }).chatTest.failure = true;
  });
  const chat = page.getByRole('complementary', { name: 'Ask about this card' });
  await chat.getByRole('button', { name: 'Give me a hint' }).click();
  await expect(chat.getByRole('alert')).toContainText('could not connect');
  const input = chat.getByRole('textbox', { name: 'Your question' });
  await expect(input).toHaveValue('Give me a hint');
  await expect(input).toBeFocused();
  await page.evaluate(() => {
    (window as unknown as { chatTest: { failure: boolean } }).chatTest.failure = false;
  });
  await input.press('Enter');
  await expect(chat.getByRole('heading', { name: 'Start with the main idea' })).toBeVisible();
  await expect(chat.getByRole('alert')).toBeHidden();
});

test('shows connection guidance when there are no providers', async ({ page }) => {
  await openChat(page, []);
  const chat = page.getByRole('complementary', { name: 'Ask about this card' });
  await expect(chat.getByRole('heading', { name: 'Bring your chat app along' })).toBeVisible();
  await expect(chat.getByRole('textbox', { name: 'Your question' })).toBeHidden();
  await chat.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
});

test('keeps the chat usable on narrow screens and remembers closing it', async ({
  page,
}, testInfo) => {
  await openChat(page, ['codex']);
  await page.setViewportSize({ width: 390, height: 700 });
  const chat = page.getByRole('complementary', { name: 'Ask about this card' });
  const bounds = (await chat.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await expect(chat.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('chat-mobile.png') });
  await chat.getByRole('button', { name: 'Close chat' }).click();
  await expect(chat).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('lumen.tutor.open'))).toBe('false');
});
