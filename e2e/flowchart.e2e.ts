import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }, info) => {
  if (info.title.includes('security policy')) {
    // Serve the page with the desktop app's Content-Security-Policy, so anything it blocks fails here.
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
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'New note' }).click();
});

const FLOW = '```mermaid\nflowchart TD\n    A[Wake up] --> B{Hungry?}\n    B -->|Yes| C[Eat]\n```';

test('inserts a flowchart from the toolbar and draws it in the editor', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Markdown editor' });
  await editor.click();
  await page.keyboard.insertText('Plan');
  await page.getByRole('button', { name: 'Insert flowchart' }).click();
  const diagram = editor.locator('.cm-lp-diagram');
  await expect(diagram.locator('svg')).toBeVisible();
  await expect(diagram.locator('svg').getByText('Decision')).toBeVisible();
  await expect(editor).not.toContainText('flowchart TD');

  // Clicking the diagram opens its source for editing.
  await diagram.click();
  await expect(editor).toContainText('flowchart TD');
});

test('draws flowcharts when the note is read, in light and dark themes', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Markdown editor' });
  await editor.click();
  await page.keyboard.insertText(`${FLOW}\n\nAfter the chart.`);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const diagram = page.locator('.preview-pane .diagram');
  await expect(diagram.locator('svg')).toBeVisible();
  await expect(diagram.locator('svg').getByText('Hungry?')).toBeVisible();
  await expect(diagram.locator('svg').getByText('Eat')).toBeVisible();
  await expect(page.locator('.preview-pane')).toContainText('After the chart.');
  const fill = () =>
    diagram
      .locator('svg .node rect, svg .node polygon, svg .node path')
      .first()
      .evaluate((node) => getComputedStyle(node).fill);
  const before = await fill();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: /^Dark/ }).click();
  await page.keyboard.press('Escape');
  await expect(diagram.locator('svg')).toBeVisible();
  await expect.poll(fill).not.toBe(before);
});

test('shows a message and the source when a flowchart is not valid', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Markdown editor' });
  await editor.click();
  await page.keyboard.insertText('```mermaid\nflowchart TD\n    A --> --> [\n```');
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const diagram = page.locator('.preview-pane .diagram');
  await expect(diagram.locator('.diagram-message')).toContainText('Flowchart could not be drawn');
  await expect(diagram.locator('pre')).toContainText('A --> --> [');
  await expect(diagram.locator('svg')).toHaveCount(0);
});

test('never runs script that a diagram label carries', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  const editor = page.getByRole('textbox', { name: 'Markdown editor' });
  await editor.click();
  await page.keyboard.insertText(
    '```mermaid\nflowchart TD\n    A["<img src=x onerror=alert(1)><script>alert(2)</script>"] --> B\n    click B "javascript:alert(3)"\n```',
  );
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const diagram = page.locator('.preview-pane .diagram');
  await expect(diagram.locator('svg, .diagram-message').first()).toBeVisible();
  await expect(diagram.locator('script, img, foreignObject')).toHaveCount(0);
  await expect(diagram.locator('[onerror], [onclick], a[href^="javascript"]')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(dialogs).toEqual([]);
});

test('does not load the diagram library for notes without flowcharts', async ({ page }) => {
  const chunks: string[] = [];
  page.on('request', (request) => {
    if (/mermaid|flowDiagram|cytoscape/i.test(request.url())) chunks.push(request.url());
  });
  const editor = page.getByRole('textbox', { name: 'Markdown editor' });
  await editor.click();
  await page.keyboard.insertText('```js\nconst a = 1;\n```\n\nPlain text.');
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.locator('.preview-pane pre')).toBeVisible();
  expect(chunks).toEqual([]);
});

test('draws flowcharts under the desktop app security policy', async ({ page }) => {
  const blocked: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) blocked.push(message.text());
  });
  const editor = page.getByRole('textbox', { name: 'Markdown editor' });
  await editor.click();
  await page.keyboard.insertText(FLOW);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.locator('.preview-pane .diagram svg').getByText('Hungry?')).toBeVisible();
  expect(blocked).toEqual([]);
});
