import { expect, test, type Page } from '@playwright/test';

async function createFolder(page: Page, name: string) {
  await page.getByRole('textbox', { name: 'Collection name' }).fill(name);
  await page.getByRole('button', { name: 'Create collection', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Collection name' })).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Note library' })).toBeVisible();
});

test('new notes stay in the selected collection, including the keyboard shortcut', async ({
  page,
}) => {
  const folder = page
    .getByRole('navigation', { name: 'Collections' })
    .locator('.folder-link')
    .first();
  const name = await folder.getAttribute('aria-label');
  await folder.click();
  const list = page.getByRole('region', { name: 'Note library' });
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await expect(list.getByRole('heading', { name: name!, exact: true })).toBeVisible();
  await expect(folder).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('combobox', { name: 'Collection', exact: true })).toHaveValue(name!);
  await page.keyboard.press('ControlOrMeta+n');
  await expect(list.getByRole('heading', { name: name!, exact: true })).toBeVisible();
});

test('creates nested folders, keeps new notes scoped, and browses all descendants', async ({
  page,
}, testInfo) => {
  await page.getByRole('button', { name: 'New collection', exact: true }).click();
  await createFolder(page, 'Physics');
  const nav = page.getByRole('navigation', { name: 'Collections' });
  await nav
    .locator('.folder-row')
    .filter({ has: page.getByRole('button', { name: 'Physics', exact: true }) })
    .hover();
  await page.getByRole('button', { name: 'Add subfolder to Physics', exact: true }).click();
  await createFolder(page, 'Waves / Interference');
  await page.screenshot({ path: testInfo.outputPath('collections.png') });
  await expect(nav.getByRole('button', { name: 'Physics / Waves', exact: true })).toBeVisible();
  await expect(
    nav.getByRole('button', { name: 'Physics / Waves / Interference', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  const list = page.getByRole('region', { name: 'Note library' });
  await expect(
    list.getByRole('heading', { name: 'Physics / Waves / Interference', exact: true }),
  ).toBeVisible();
  await expect(list.getByText('2 notes', { exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Physics', exact: true }).click();
  await expect(list.getByText('3 notes', { exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Physics / Waves', exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Collection', exact: true })).toHaveValue(
    'Physics / Waves',
  );
  await page.reload();
  await expect(
    nav.getByRole('button', { name: 'Physics / Waves / Interference', exact: true }),
  ).toBeVisible();
});

test('remembers each folder disclosure and the collections section', async ({ page }) => {
  await page.getByRole('button', { name: 'New collection', exact: true }).click();
  await createFolder(page, 'Physics / Waves / Interference');
  await page.getByRole('button', { name: 'Collapse Physics / Waves', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Expand Physics / Waves', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Physics / Waves / Interference', exact: true }),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Collapse collections', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Collections' })).toBeHidden();
  await page.getByRole('button', { name: 'Expand collections', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Expand Physics / Waves', exact: true }),
  ).toBeVisible();
});

test('shows one collections entry in the collapsed rail and restores access to the tree', async ({
  page,
}, testInfo) => {
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByRole('navigation', { name: 'Collections' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'New collection', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Browse collections' })).toBeVisible();
  await expect.poll(async () => (await page.locator('.sidebar').boundingBox())!.width).toBe(64);
  await page.screenshot({ path: testInfo.outputPath('collections-rail.png') });
  await page.getByRole('button', { name: 'Browse collections' }).click();
  await expect(page.getByRole('navigation', { name: 'Collections' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
});

test('remembers the details panel after closing and reopening it', async ({ page }) => {
  await page.getByRole('button', { name: 'Close note details' }).click();
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Note details' })).toBeHidden();
  await page.getByRole('button', { name: 'Toggle note details' }).click();
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Note details' })).toBeVisible();
});

test('remembers settings disclosures across dialog close and app reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('View prompt', { exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.chat-app-details').first()).toHaveAttribute('open', '');
  await page.getByText('View prompt', { exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.chat-app-details').first()).not.toHaveAttribute('open');
});
