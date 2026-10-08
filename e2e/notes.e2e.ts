import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Note library' })).toBeVisible();
});

test('opens with the starter notes', async ({ page }) => {
  const list = page.getByRole('region', { name: 'Note library' });
  await expect(list.getByRole('heading', { name: 'All notes' })).toBeVisible();
  await expect(list.getByText('3 notes')).toBeVisible();
  // Where notes are stored is explained in Settings.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toContainText('browser storage');
});

test('creates a note and keeps it after a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'New note' }).click();
  const title = page.getByRole('textbox', { name: 'Note title' });
  await title.fill('Photosynthesis basics');
  // Save status only shows while there is something left to save.
  await expect(page.getByText(/^(Saving…|Unsaved changes)$/)).toHaveCount(0);
  await page.reload();
  const list = page.getByRole('region', { name: 'Note library' });
  await expect(list.getByRole('heading', { name: 'Photosynthesis basics' })).toBeVisible();
  await expect(list.getByText('4 notes')).toBeVisible();
});

test('pins and trashes a note from the actions menu', async ({ page }) => {
  const list = page.getByRole('region', { name: 'Note library' });
  const title = await page.getByRole('textbox', { name: 'Note title' }).inputValue();
  const menu = page.getByRole('button', { name: 'More actions' });
  // The first starter note begins pinned.
  await menu.click();
  await page.getByRole('menuitem', { name: 'Unpin note', exact: true }).click();
  await expect(page.getByRole('menu')).toBeHidden();
  await menu.click();
  await expect(page.getByRole('menuitem', { name: 'Pin note', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();

  await menu.click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await expect(list.getByRole('heading', { name: title })).toHaveCount(0);
  await expect(list.getByText('2 notes')).toBeVisible();
});

test('edits hashtag tags in the note header and persists them', async ({ page }) => {
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('textbox', { name: 'Note title' }).fill('Tagged note');
  await page.getByRole('button', { name: 'Close note details' }).click();
  await page.getByRole('button', { name: 'Add tags', exact: true }).click();
  const tags = page.getByRole('textbox', { name: 'Note tags', exact: true });
  await expect(tags).toBeFocused();
  await tags.fill('#tag1 #tag2 #tag3 #tag4 #tag1 #');
  await tags.press('Enter');
  const headerTags = page.getByRole('button', { name: 'Edit tags', exact: true });
  await expect(headerTags).toBeFocused();
  await expect(headerTags.locator('.tag')).toHaveText(['#tag1', '#tag2', '#tag3', '#tag4']);

  await page.getByRole('button', { name: 'Toggle note details' }).click();
  const detailsTags = page.getByRole('textbox', { name: 'Tags', exact: true });
  await expect(detailsTags).toHaveValue('tag1, tag2, tag3, tag4');
  await expect(page.getByText(/^(Saving…|Unsaved changes)$/)).toHaveCount(0);
  await page.reload();
  await page
    .getByRole('region', { name: 'Note library' })
    .getByRole('heading', { name: 'Tagged note' })
    .click();
  await expect(headerTags.locator('.tag')).toHaveText(['#tag1', '#tag2', '#tag3', '#tag4']);

  await headerTags.click();
  await expect(tags).toHaveValue('#tag1 #tag2 #tag3 #tag4');
  await tags.fill('#cancelled');
  await tags.press('Escape');
  await expect(detailsTags).toHaveValue('tag1, tag2, tag3, tag4');

  // Clicking another note saves the draft to the note it belongs to.
  await headerTags.click();
  await tags.fill('#updated #nested/tag');
  const list = page.getByRole('region', { name: 'Note library' });
  await list.getByRole('heading', { name: 'A little clearer, every day.' }).click();
  await expect(headerTags.locator('.tag')).toHaveText(['#welcome']);
  await list.getByRole('heading', { name: 'Tagged note' }).click();
  await expect(detailsTags).toHaveValue('updated, nested/tag');

  // Changes in the details panel are also reflected in the header.
  await detailsTags.fill('from-details');
  await detailsTags.press('Tab');
  await expect(headerTags.locator('.tag')).toHaveText(['#from-details']);
  await headerTags.click();
  await tags.fill('');
  await tags.press('Enter');
  await expect(page.getByRole('button', { name: 'Add tags', exact: true })).toBeVisible();
  await expect(detailsTags).toHaveValue('');
});

test('names a new collection in place', async ({ page }) => {
  await page.getByRole('button', { name: 'New collection' }).click();
  await page.getByRole('textbox', { name: 'Collection name' }).fill('Chemistry');
  await page.keyboard.press('Enter');
  const collections = page.getByRole('navigation', { name: 'Collections' });
  await expect(collections.getByRole('button', { name: 'Chemistry' })).toBeVisible();
  const list = page.getByRole('region', { name: 'Note library' });
  await expect(list.getByRole('heading', { name: 'Chemistry' })).toBeVisible();
  await expect(list.getByText('1 note', { exact: true })).toBeVisible();

  // Escape cancels without creating anything.
  await page.getByRole('button', { name: 'New collection' }).click();
  await page.keyboard.type('Draft');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Collection name' })).toBeHidden();
  await expect(collections.getByRole('button')).toHaveCount(3);
});

test('captures pasted Markdown to the inbox', async ({ page }) => {
  await page.getByRole('button', { name: 'Capture an idea' }).click();
  const dialog = page.getByRole('dialog', { name: 'Capture' });
  await dialog
    .getByRole('textbox', { name: 'Markdown', exact: true })
    .fill('# Osmosis\n\nWater follows salt.');
  await dialog.getByRole('button', { name: 'Save to inbox' }).click();
  await expect(dialog).toBeHidden();
  const list = page.getByRole('region', { name: 'Note library' });
  await expect(list.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await expect(list.getByRole('heading', { name: 'Osmosis' })).toBeVisible();
});

test('filters the list', async ({ page }) => {
  const list = page.getByRole('region', { name: 'Note library' });
  await list.getByRole('textbox', { name: 'Filter notes' }).fill('markdown field');
  await expect(list.getByRole('heading', { level: 2 })).toHaveCount(1);
  await expect(list.getByRole('heading', { name: 'Your Markdown field guide' })).toBeVisible();
});

test('finds a note with ⌘K', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.type('learning that stays');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue(
    'Learning that stays with you',
  );
});

test('collapses the sidebar and remembers it', async ({ page }) => {
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
});

test('hides the note list and brings it back', async ({ page }) => {
  const list = page.getByRole('region', { name: 'Note library' });
  await page.getByRole('button', { name: 'Hide note list' }).click();
  await expect(list).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toBeVisible();
  await page.reload();
  await expect(list).toBeHidden();
  await page.getByRole('button', { name: 'Show note list' }).click();
  await expect(list).toBeVisible();

  await page.keyboard.press('Control+Meta+l');
  await expect(list).toBeHidden();
  // Picking a list in the sidebar shows the note list again.
  await page.getByRole('button', { name: /^Inbox/ }).click();
  await expect(list).toBeVisible();
  await expect(list.getByRole('heading', { name: 'Inbox' })).toBeVisible();
});

test('collapses the sidebar and the note list together', async ({ page }) => {
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.getByRole('button', { name: 'Hide note list' }).click();
  const shell = page.locator('.app-shell');
  const columns = await shell.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  expect(columns.split(' ')).toHaveLength(2);
  const editor = await page.locator('.document-workspace').boundingBox();
  expect(editor!.width).toBeGreaterThan(1200);
});

test('scales interface text without changing document text', async ({ page }) => {
  const size = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const nav = await size('.main-nav button');
  const prose = await size('.prose p');
  const sidebar = await page.locator('.sidebar').boundingBox();

  await page.keyboard.press('ControlOrMeta+=');
  await page.keyboard.press('ControlOrMeta+=');
  await expect.poll(() => size('.main-nav button')).toBeCloseTo(nav * 1.1, 1);
  expect(await size('.prose p')).toBe(prose);
  // The column width animates, so wait for it to settle.
  await expect
    .poll(async () => (await page.locator('.sidebar').boundingBox())!.width)
    .toBeGreaterThan(sidebar!.width);

  await page.reload();
  await expect.poll(() => size('.main-nav button')).toBeCloseTo(nav * 1.1, 1);
  await page.keyboard.press('ControlOrMeta+0');
  await expect.poll(() => size('.main-nav button')).toBeCloseTo(nav, 1);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('slider', { name: 'Interface text size' }).fill('1.25');
  await expect.poll(() => size('.main-nav button')).toBeCloseTo(nav * 1.25, 1);
  expect(await size('.prose p')).toBe(prose);
});
