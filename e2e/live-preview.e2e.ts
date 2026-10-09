import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New note' }).click();
});

test('renders Markdown in place and reveals it on the line being edited', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Markdown editor' });
  await editor.click();
  await page.keyboard.insertText(
    '# Waves\nSome **bold** and a [link](https://example.com).\n- [ ] Review\n\nEnergy $E = mc^2$\n\nEnd',
  );

  const lines = editor.locator('.cm-line');
  const heading = lines.first();
  await expect(heading).toHaveClass(/cm-lp-h1/);
  await expect(heading).toHaveText('Waves');
  await expect(lines.nth(1)).toHaveText('Some bold and a link.');
  await expect(editor.locator('.cm-lp-math .katex')).toBeVisible();

  // The line with the cursor shows its Markdown again.
  await heading.click();
  await expect(heading).toHaveText('# Waves');

  // A task checkbox toggles the source without opening it.
  await page.locator('.cm-lp-task').click();
  await expect(page.locator('.cm-lp-task')).toBeChecked();
  await expect(lines.nth(2)).toHaveText('Review');
});

test('shows plain Markdown when rendering in the editor is off', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: 'Render Markdown in the editor' }).uncheck();
  await page.keyboard.press('Escape');
  const editor = page.getByRole('textbox', { name: 'Markdown editor' });
  await editor.click();
  await page.keyboard.insertText('# Waves\n\nEnd');
  await expect(editor.locator('.cm-line').first()).toHaveText('# Waves');
  await expect(editor.locator('.cm-lp-h1')).toHaveCount(0);
});
