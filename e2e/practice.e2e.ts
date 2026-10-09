import { expect, test } from '@playwright/test';

test('practices only the chosen collections and remembers the choice', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Note library' })).toBeVisible();
  await page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('lumen.library.v1')!);
    const source = library.notes.find((n: { prompts: unknown[] }) => n.prompts.length);
    library.notes.push({
      ...source,
      id: 'optics',
      title: 'How lenses bend light',
      collection: 'Physics / Optics',
      prompts: source.prompts.map((p: { id: string }) => ({ ...p, id: `optics-${p.id}` })),
    });
    localStorage.setItem('lumen.library.v1', JSON.stringify(library));
  });
  await page.reload();
  await page.getByRole('button', { name: /^Practice/ }).click();

  const from = page.getByRole('group', { name: 'Practice from' });
  const overview = page.locator('.session-overview strong');
  const all = Number(await overview.textContent());
  await expect(from.getByRole('button', { name: /^All collections/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await from
    .getByRole('button', { name: /^Physics\b/ })
    .first()
    .click();
  await expect(from.getByRole('button', { name: /^All collections/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(overview).toHaveText(String(all / 2));

  await page.reload();
  await page.getByRole('button', { name: /^Practice/ }).click();
  await expect(overview).toHaveText(String(all / 2));
  await page.screenshot({ path: testInfo.outputPath('practice-collections.png') });
  await page.getByRole('button', { name: 'Start a short session' }).click();
  await expect(page.locator('.question-meta .text-button')).toHaveText('How lenses bend light');

  await page.getByRole('button', { name: 'End session' }).click();
  await from.getByRole('button', { name: /^All collections/ }).click();
  await expect(overview).toHaveText(String(all));
});
