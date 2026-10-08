import { expect, test, type Page } from '@playwright/test';

async function newNote(page: Page, title: string) {
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill(title);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('links notes with [[ autocomplete, follows links, and lists backlinks', async ({ page }) => {
  await newNote(page, 'Wave equation');
  await newNote(page, 'Optics');
  const editor = page.getByRole('textbox', { name: 'Markdown editor' });
  await editor.click();
  await page.keyboard.insertText('Light obeys the ');
  await page.keyboard.type('[[wave');
  const suggestions = page.getByRole('listbox');
  const option = suggestions.getByRole('option', { name: 'Wave equation' });
  await expect(option).toBeVisible();
  await option.click();
  await page.keyboard.insertText(', unlike [[Lenses]].');
  await expect(editor).toContainText('Light obeys the [[Wave equation]], unlike [[Lenses]].');

  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const preview = page.locator('.preview-pane');
  await expect(preview.locator('a.wikilink-missing')).toHaveText('Lenses');
  await preview.getByRole('link', { name: 'Wave equation' }).click();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Wave equation');

  const panel = page.getByRole('complementary', { name: 'Note details' });
  if (!(await panel.isVisible()))
    await page.getByRole('button', { name: 'Toggle note details' }).click();
  const linkedFrom = panel.getByRole('navigation', { name: 'Linked from' });
  await expect(linkedFrom.getByRole('button')).toHaveText(['Optics']);
  await linkedFrom.getByRole('button', { name: 'Optics' }).click();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Optics');

  // A link to a missing note creates it.
  await page.locator('.preview-pane a.wikilink-missing').click();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Lenses');
  await expect(
    panel.getByRole('navigation', { name: 'Linked from' }).getByRole('button'),
  ).toHaveText(['Optics']);
});

test('shows notes and their links in the graph and opens a note from it', async ({ page }) => {
  await newNote(page, 'Hub');
  const editor = page.getByRole('textbox', { name: 'Markdown editor' });
  await editor.click();
  await page.keyboard.insertText('[[Spoke one]] [[Spoke two]] [[Welcome to Lumen]]');
  await newNote(page, 'Spoke one');
  await newNote(page, 'Spoke two');
  await editor.click();
  await page.keyboard.insertText('Back to [[Hub]]');
  await expect(page.getByText(/^(Saving…|Unsaved changes)$/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  const graph = page.getByRole('group', { name: 'Note graph' });
  await expect(graph).toBeVisible();
  await expect(graph.getByRole('button', { name: 'Hub' })).toBeVisible();
  await expect(graph.locator('.graph-link')).toHaveCount(3);

  // Hiding unlinked notes leaves only notes with links.
  const before = await graph.locator('.graph-node').count();
  await page.getByRole('checkbox', { name: 'Unlinked notes' }).uncheck();
  await expect(graph.locator('.graph-node')).toHaveCount(3);
  expect(before).toBeGreaterThan(3);
  await page.getByRole('checkbox', { name: 'Unlinked notes' }).check();

  await graph.getByRole('button', { name: 'Spoke one' }).locator('circle').click();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Spoke one');
});
