import { expect, test, type Page } from '@playwright/test';

const shell = (page: Page) => page.locator('.app-shell');
const cssVar = (page: Page, name: string) =>
  shell(page).evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('switches to Tokyo Night and keeps it after a reload', async ({ page }) => {
  const settings = await openSettings(page);
  await settings.getByRole('radio', { name: 'Tokyo Night' }).click();
  await expect(settings.getByRole('radio', { name: 'Tokyo Night' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(await cssVar(page, '--background')).toBe('#1a1b26');
  await expect(shell(page)).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  expect(await cssVar(page, '--background')).toBe('#1a1b26');
});

test('follows the system appearance', async ({ page }) => {
  const settings = await openSettings(page);
  await settings.getByRole('radio', { name: 'System' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(shell(page)).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(shell(page)).toHaveAttribute('data-theme', 'light');
});

test('creates, edits, and deletes a custom theme', async ({ page }) => {
  let settings = await openSettings(page);
  await settings.getByRole('radio', { name: 'Paper' }).click();
  await settings.getByRole('button', { name: /New theme from Paper/ }).click();

  await settings.getByLabel('Name').fill('Reading room');
  await settings.getByLabel('Accent', { exact: true }).fill('#aa3366');
  // The change previews live before saving.
  expect(await cssVar(page, '--accent')).toBe('#aa3366');
  await settings.getByRole('button', { name: 'Save theme' }).click();

  await expect(settings.getByRole('radio', { name: 'Reading room' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.reload();
  expect(await cssVar(page, '--accent')).toBe('#aa3366');

  settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Edit Reading room' }).click();
  await settings.getByRole('button', { name: 'Delete' }).click();
  await expect(settings.getByRole('radio', { name: 'Reading room' })).toHaveCount(0);
  await expect(settings.getByRole('radio', { name: 'Light' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('discards an unsaved custom theme on cancel', async ({ page }) => {
  const settings = await openSettings(page);
  const before = await cssVar(page, '--accent');
  await settings.getByRole('button', { name: /New theme from/ }).click();
  await settings.getByLabel('Accent', { exact: true }).fill('#00ff00');
  await settings.getByRole('button', { name: 'Cancel' }).click();
  expect(await cssVar(page, '--accent')).toBe(before);
  await expect(settings.getByRole('radio')).toHaveCount(9);
});
