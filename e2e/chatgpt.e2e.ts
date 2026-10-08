import { expect, test } from '@playwright/test';

test('connects the desktop app locally and can disconnect without account setup', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const control = { connected: false, fail: false, calls: [] as string[] };
    Object.defineProperty(window, 'isTauri', { value: true });
    Object.defineProperty(window, 'lumenChatGPTTest', { value: control });
    Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', {
      value: { unregisterListener() {} },
    });
    const status = () => ({
      installed: true,
      connected: control.connected,
      otherPath: false,
      serverPath: '/Applications/Lumen.app/Contents/MacOS/lumen-mcp',
    });
    let callback = 0;
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => ++callback,
        unregisterCallback() {},
        async invoke(command: string, args: Record<string, unknown> = {}) {
          control.calls.push(command);
          if (command === 'load_library')
            return { notes: args.seeds, attempts: [], path: '/tmp/lumen-test-library' };
          if (command === 'claude_status')
            return { ...status(), installed: false, connected: false };
          if (command === 'chatgpt_status') return status();
          if (command === 'connect_chatgpt') {
            if (control.fail) throw new Error('ChatGPT settings could not be read.');
            control.connected = true;
            return status();
          }
          if (command === 'disconnect_chatgpt') {
            control.connected = false;
            return status();
          }
          if (command === 'assistant_providers') return [];
          return null;
        },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const connect = page.getByRole('button', { name: 'Connect ChatGPT', exact: true });
  await expect(connect).toBeEnabled();
  await page.evaluate(() => {
    (window as unknown as { lumenChatGPTTest: { fail: boolean } }).lumenChatGPTTest.fail = true;
  });
  await connect.click();
  await expect(page.getByRole('alert')).toContainText('settings could not be read');
  await expect(connect).toBeEnabled();
  await page.evaluate(() => {
    (window as unknown as { lumenChatGPTTest: { fail: boolean } }).lumenChatGPTTest.fail = false;
  });
  await connect.click();
  await expect(page.getByRole('button', { name: 'Disconnect ChatGPT' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Restart the Lumen server');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /API key|Tunnel ID/ })).toHaveCount(0);
  // Reopening Settings reads the connection from the desktop configuration.
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Disconnect ChatGPT' }).click();
  await expect(connect).toBeVisible();
  const calls = await page.evaluate(
    () => (window as unknown as { lumenChatGPTTest: { calls: string[] } }).lumenChatGPTTest.calls,
  );
  expect(calls.filter((c) => c === 'connect_chatgpt')).toHaveLength(2);
  expect(calls).toContain('disconnect_chatgpt');
  expect(calls).not.toContain('ask_assistant');
});
