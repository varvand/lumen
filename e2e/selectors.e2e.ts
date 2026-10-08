import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Note library' })).toBeVisible();
});

test('sorts notes with the app menu and dismisses it on outside click or Tab', async ({ page }) => {
  for (const title of ['Zebra', 'Apple']) {
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await page.getByRole('textbox', { name: 'Note title' }).fill(title);
  }
  const sort = page.getByRole('combobox', { name: 'Sort notes' });
  await sort.click();
  await expect(page.getByRole('option', { name: 'Last edited' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('option', { name: 'Title', exact: true }).click();
  await expect(sort).toHaveText('Title');
  await expect(sort).toBeFocused();
  await expect(page.getByRole('listbox')).toBeHidden();
  const titles = await page.locator('.note-item h2').allTextContents();
  expect(titles.indexOf('Apple')).toBeLessThan(titles.indexOf('Zebra'));

  await sort.click();
  await page.getByRole('textbox', { name: 'Filter notes' }).click();
  await expect(sort).toHaveAttribute('aria-expanded', 'false');
  await sort.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(sort).not.toBeFocused();
});

test('supports keyboard navigation, typeahead, and cancelling without changing the value', async ({
  page,
}) => {
  const sort = page.getByRole('combobox', { name: 'Sort notes' });
  await sort.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  await expect(sort).toHaveText('Last edited');
  await expect(sort).toBeFocused();
  await expect(sort).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await page.keyboard.press('t');
  await page.keyboard.press('Enter');
  await expect(sort).toHaveText('Title');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(sort).toHaveText('Last edited');
});

test('matches the selected theme inside Settings and keeps typeface changes', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('radio', { name: 'Tokyo Night' }).click();
  const font = dialog.getByRole('combobox', { name: 'Document typeface' });
  await font.click();
  const listbox = dialog.getByRole('listbox', { name: 'Document typeface' });
  await expect(listbox).toBeVisible();
  expect(await listbox.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(26, 27, 38)',
  );
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(listbox).toBeHidden();
  await expect(font).toHaveText('Newsreader · Serif');
  await font.click();
  await dialog.getByRole('option', { name: 'DM Sans · Sans serif' }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-reader', 'sans');
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-reader', 'sans');
});

test('changes learning goals and saves question activities through themed menus', async ({
  page,
}) => {
  const goal = page.getByRole('combobox', { name: 'Learning goal' });
  await goal.click();
  await page.getByRole('option', { name: 'Learn to apply' }).click();
  await expect(goal).toHaveText('Learn to apply');
  await page.getByRole('button', { name: 'Add a question' }).click();
  const dialog = page.getByRole('dialog', { name: 'New question' });
  await dialog.getByRole('combobox', { name: 'Activity' }).click();
  await dialog.getByRole('option', { name: 'Explain · understand why' }).click();
  await dialog.getByRole('textbox', { name: 'Question', exact: true }).fill('Why does this work?');
  await dialog.getByRole('textbox', { name: 'Suggested answer' }).fill('Explain the mechanism.');
  await dialog.getByRole('button', { name: 'Save question' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(goal).toHaveText('Learn to apply');
  await page.getByRole('button', { name: 'explain Why does this work?' }).click();
  await expect(page.getByRole('combobox', { name: 'Activity' })).toHaveText(
    'Explain · understand why',
  );
});

test('keeps menus inside the viewport at enlarged interface sizes', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 600 });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('slider', { name: 'Interface text size' }).fill('1.25');
  await page.getByRole('combobox', { name: 'Document typeface' }).click();
  const menu = page.getByRole('listbox');
  await expect(menu).toBeVisible();
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(812);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(592);
});
