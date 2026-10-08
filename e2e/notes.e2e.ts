import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Note library' })).toBeVisible();
});

test('opens with the starter notes', async ({ page }) => {
  const list = page.getByRole('region', { name: 'Note library' });
  await expect(list.getByRole('heading', { name: 'All notes' })).toBeVisible();
  await expect(list.getByText('3 notes')).toBeVisible();
  await expect(page.getByText('Browser preview · local storage')).toBeVisible();
});

test('creates a note and keeps it after a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'New note' }).click();
  const title = page.getByRole('textbox', { name: 'Note title' });
  await title.fill('Photosynthesis basics');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  const list = page.getByRole('region', { name: 'Note library' });
  await expect(list.getByRole('heading', { name: 'Photosynthesis basics' })).toBeVisible();
  await expect(list.getByText('4 notes')).toBeVisible();
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
