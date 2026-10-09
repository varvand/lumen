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
  await expect(list.locator('.list-count')).toHaveText('2 notes');
  // Clicking a folder opens it and toggles its subfolders.
  const physics = nav.getByRole('button', { name: 'Physics', exact: true });
  const waves = nav.getByRole('button', { name: 'Physics / Waves', exact: true });
  await physics.click();
  await expect(list.locator('.list-count')).toHaveText('3 notes');
  await expect(waves).toBeHidden();
  await physics.click();
  await expect(waves).toBeVisible();
  await waves.click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Collection', exact: true })).toHaveValue(
    'Physics / Waves',
  );
  await page.reload();
  await nav.getByRole('button', { name: 'Expand Physics / Waves', exact: true }).click();
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

test('moves, trashes and restores a note from its right-click menu', async ({ page }) => {
  const list = page.getByRole('region', { name: 'Note library' });
  const note = list.locator('.note-item').filter({ hasText: 'Learning that stays with you' });
  await note.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Note actions' });
  await expect(menu.getByRole('menuitem').first()).toBeFocused();

  await menu.getByRole('menuitem', { name: 'Move to collection' }).hover();
  const collections = page.getByRole('menu', { name: 'Move to collection' });
  await expect(
    collections.getByRole('menuitemradio', { name: 'Learning science' }),
  ).toHaveAttribute('aria-checked', 'true');
  await collections.getByRole('menuitemradio', { name: 'Getting started' }).click();
  await expect(menu).toBeHidden();
  await expect(note.locator('.note-collection')).toHaveText('Getting started');

  // The keyboard reaches the same menu and its submenu.
  await note.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(collections.getByRole('menuitemradio').first()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(collections).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(note).toBeFocused();

  await note.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await expect(note).toHaveCount(0);
  await expect(list.locator('.list-count')).toHaveText('2 notes');

  await page.getByRole('button', { name: 'Trash' }).click();
  await list.locator('.note-item').first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Restore note' }).click();
  await expect(list.locator('.note-item')).toHaveCount(0);
});
