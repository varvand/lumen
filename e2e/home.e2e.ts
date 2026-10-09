import { expect, test, type Page } from '@playwright/test';

// Home opens first in a fresh browser, so this file starts without the library-start state.
test.use({ storageState: { cookies: [], origins: [] } });

const FORECAST = {
  current: { time: '2026-10-09T13:45', temperature_2m: 17.6, weather_code: 2, is_day: 1 },
  daily: {
    time: ['2026-10-09', '2026-10-10'],
    temperature_2m_max: [19.2, 18],
    temperature_2m_min: [9.4, 8],
    precipitation_probability_max: [20, 40],
  },
  hourly: {
    time: Array.from({ length: 48 }, (_, i) =>
      i < 24
        ? `2026-10-09T${String(i).padStart(2, '0')}:00`
        : `2026-10-10T${String(i - 24).padStart(2, '0')}:00`,
    ),
    temperature_2m: Array.from({ length: 48 }, (_, i) => 10 + (i % 12)),
    weather_code: Array.from({ length: 48 }, () => 1),
  },
};

async function mockWeather(page: Page) {
  await page.route('https://geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({
      json: {
        results: [
          {
            name: 'Berlin',
            admin1: 'Land Berlin',
            country: 'Germany',
            latitude: 52.52,
            longitude: 13.41,
          },
        ],
      },
    }),
  );
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: FORECAST }));
}

test('greets, tracks to-dos from notes and Home, and can be customized', async ({
  page,
}, testInfo) => {
  await mockWeather(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Hello.' })).toBeVisible();
  const weekday = new Date().toLocaleDateString(undefined, { weekday: 'long' });
  await expect(page.locator('.home-sentence')).toContainText(`Today is ${weekday}`);

  // A task due today in a note shows up, and checking it off updates the note.
  await page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('lumen.library.v1')!);
    library.notes[0].body += '\n\n- [ ] Review the lecture @today\n- [ ] Someday maybe\n';
    localStorage.setItem('lumen.library.v1', JSON.stringify(library));
  });
  await page.reload();
  const today = page.getByRole('region', { name: 'Today' });
  const noteTask = today.getByRole('checkbox', { name: 'Review the lecture' });
  await expect(noteTask).toBeVisible();
  await expect(today.getByText('Someday maybe')).toBeHidden();

  await today.getByRole('textbox', { name: 'Add a to-do' }).fill('Buy oat milk');
  await today.getByRole('textbox', { name: 'Add a to-do' }).press('Enter');
  await expect(today.getByRole('checkbox', { name: 'Buy oat milk' })).toBeVisible();
  await expect(today.locator('.home-card-note')).toHaveText('2 to do');

  await page.getByRole('button', { name: 'Customize' }).click();
  const dialog = page.getByRole('dialog', { name: 'Customize Home' });
  await dialog.getByRole('textbox', { name: 'Your name' }).fill('Vincent');
  await dialog.getByRole('textbox', { name: 'Search for a city' }).fill('Berlin');
  await dialog.getByRole('button', { name: 'Search', exact: true }).click();
  await dialog.getByRole('button', { name: 'Berlin, Land Berlin, Germany' }).click();
  await dialog.getByRole('button', { name: 'Move Weather up' }).click();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Vincent.' })).toBeVisible();
  await expect(page.locator('.home-sentence')).toContainText('In Berlin it’s 18°, partly cloudy.');
  await expect(page.getByRole('region', { name: 'Weather' })).toContainText('H 19°');
  await expect(page.locator('.home-grid > section').first()).toHaveAttribute(
    'aria-labelledby',
    'home-weather-title',
  );
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  await page.screenshot({ path: testInfo.outputPath('home.png') });
  await page.locator('.home-page').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.screenshot({ path: testInfo.outputPath('home-scrolled.png') });

  await noteTask.click();
  await expect(noteTask).toHaveAttribute('aria-checked', 'true');
  await today.getByRole('checkbox', { name: 'Buy oat milk' }).click();
  await expect(today.locator('.home-card-note')).toHaveText('All done');
  await today.getByRole('button', { name: 'Remove Buy oat milk' }).click();
  await expect(today.getByText('Buy oat milk')).toBeHidden();

  // Everything persists, and the checked task is checked in the note itself.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Vincent.' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Today' }).getByText('Review the lecture'),
  ).toBeHidden();
  const body = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lumen.library.v1')!).notes[0].body,
  );
  expect(body).toContain('- [x] Review the lecture @today');
});

test('can open on the library instead', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Customize' }).click();
  const dialog = page.getByRole('dialog', { name: 'Customize Home' });
  await dialog.getByRole('switch', { name: 'Open Home when Lumen starts' }).uncheck();
  await dialog.getByRole('switch', { name: 'Practice' }).uncheck();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('region', { name: 'Practice' })).toBeHidden();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Note library' })).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hello.' })).toBeVisible();
});
