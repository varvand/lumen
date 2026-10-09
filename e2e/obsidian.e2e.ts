import path from 'node:path';
import { expect, test } from '@playwright/test';

const vault = path.join(import.meta.dirname, 'fixtures', 'Study Vault');

async function importVault(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Import Obsidian vault' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from Obsidian' });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles(vault);
  return dialog;
}

test('imports an Obsidian vault into collections', async ({ page }) => {
  await page.goto('/');
  const dialog = await importVault(page);
  await expect(dialog.getByText('Imported 3 notes into 2 collections.')).toBeVisible();
  await expect(dialog.getByRole('listitem')).toHaveText(
    '1 attachment (images, PDFs, other files) wasn’t imported.',
  );
  await dialog.getByRole('button', { name: 'Show notes' }).click();

  const collections = page.getByRole('navigation', { name: 'Collections' });
  await expect(
    collections.getByRole('button', { name: 'Physics / Waves', exact: true }),
  ).toBeVisible();
  await expect(collections.getByRole('button', { name: 'Study Vault', exact: true })).toBeVisible();

  await collections.getByRole('button', { name: 'Physics / Waves', exact: true }).click();
  await page
    .getByRole('region', { name: 'Note library' })
    .getByRole('heading', { name: 'Interference' })
    .click();
  const doc = page.locator('.prose');
  await expect(doc).toContainText('When two waves meet, they add up.');
  await expect(doc.locator('blockquote strong')).toHaveText('Tip: Remember');
  await expect(doc).toContainText('Attachment not imported: fringes.png');
  await expect(doc).toContainText('aliases: Superposition');
  await expect(doc).not.toContainText('[[');
});

test('importing the same vault again adds nothing', async ({ page }) => {
  await page.goto('/');
  let dialog = await importVault(page);
  await expect(dialog.getByText('Imported 3 notes into 2 collections.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  dialog = await importVault(page);
  await expect(dialog.getByText('No new notes to import.')).toBeVisible();
  await expect(
    dialog.getByText('3 notes were already in Lumen and left as they are.'),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Note library' }).locator('.list-count'),
  ).toHaveText('6 notes');
});
