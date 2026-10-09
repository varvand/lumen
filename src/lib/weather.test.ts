// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeWeather, findPlaces, forecast, type Place } from './weather';

const berlin: Place = {
  name: 'Berlin',
  region: 'Land Berlin',
  country: 'Germany',
  latitude: 52.52,
  longitude: 13.41,
};

function respond(body: unknown, status = 200) {
  const fetch = vi.fn<(url: string) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/** Hourly entries from 00:00 today through 23:00 tomorrow, like a two-day forecast. */
const times = [9, 10].flatMap((day) =>
  Array.from(
    { length: 24 },
    (_, h) => `2026-10-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`,
  ),
);
function forecastBody(now: string) {
  return {
    current: { time: now, temperature_2m: 14.6, weather_code: 2, is_day: 1 },
    daily: {
      temperature_2m_max: [17.4, 15],
      temperature_2m_min: [-0.3, 6],
      precipitation_probability_max: [40, 10],
    },
    hourly: {
      time: times,
      temperature_2m: times.map((_, i) => i + 0.4),
      weather_code: times.map((_, i) => (i % 2 ? 61 : 3)),
    },
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('describeWeather', () => {
  it('shows the sun by day and the moon by night for clear skies', () => {
    expect(describeWeather(0)).toEqual({ label: 'Clear', icon: 'sun' });
    expect(describeWeather(0, false)).toEqual({ label: 'Clear', icon: 'moon' });
  });
  it('maps partly cloudy skies for day and night', () => {
    expect(describeWeather(2, true)).toEqual({ label: 'Partly cloudy', icon: 'cloud-sun' });
    expect(describeWeather(2, false).icon).toBe('cloud-moon');
  });
  it('maps fog, drizzle, rain, snow and thunderstorms', () => {
    expect(describeWeather(45)).toEqual({ label: 'Fog', icon: 'fog' });
    expect(describeWeather(51)).toEqual({ label: 'Light drizzle', icon: 'drizzle' });
    expect(describeWeather(61)).toEqual({ label: 'Light rain', icon: 'rain' });
    expect(describeWeather(81, false)).toEqual({ label: 'Showers', icon: 'rain' });
    expect(describeWeather(73)).toEqual({ label: 'Snow', icon: 'snow' });
    expect(describeWeather(95)).toEqual({ label: 'Thunderstorm', icon: 'storm' });
  });
  it('falls back for unknown codes', () => {
    expect(describeWeather(42)).toEqual({ label: 'Unknown weather', icon: 'cloud' });
  });
});

describe('findPlaces', () => {
  it('returns nothing for a blank query without asking the service', async () => {
    const fetch = respond({});
    expect(await findPlaces('   ')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reads matching places', async () => {
    const fetch = respond({
      results: [
        {
          name: 'Berlin',
          admin1: 'Land Berlin',
          country: 'Germany',
          latitude: 52.52,
          longitude: 13.41,
        },
        { name: 'Berlin', country: 'United States', latitude: 44.47, longitude: -71.19 },
      ],
    });
    expect(await findPlaces(' Berlin ')).toEqual([
      berlin,
      { name: 'Berlin', region: '', country: 'United States', latitude: 44.47, longitude: -71.19 },
    ]);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(url.searchParams.get('name')).toBe('Berlin');
    expect(url.searchParams.get('count')).toBe('5');
  });
  it('returns nothing when no place matches', async () => {
    respond({ generationtime_ms: 0.4 });
    expect(await findPlaces('Nowhereville')).toEqual([]);
  });
  it('explains a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(findPlaces('Berlin')).rejects.toThrow(/Couldn’t reach the weather service/);
  });
});

describe('forecast', () => {
  it('reads today and the next six hours from the coming full hour', async () => {
    const fetch = respond(forecastBody('2026-10-09T13:45'));
    const result = await forecast(berlin, 'celsius');
    expect(result).toMatchObject({
      temperature: 15,
      high: 17,
      low: 0,
      code: 2,
      isDay: true,
      precipitation: 40,
    });
    expect(Object.is(result.low, -0)).toBe(false);
    expect(result.hours).toEqual([
      { time: '14:00', temperature: 14, code: 3 },
      { time: '15:00', temperature: 15, code: 61 },
      { time: '16:00', temperature: 16, code: 3 },
      { time: '17:00', temperature: 17, code: 61 },
      { time: '18:00', temperature: 18, code: 3 },
      { time: '19:00', temperature: 19, code: 61 },
    ]);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(url.searchParams.get('temperature_unit')).toBe('celsius');
    expect(url.searchParams.get('current')).toBe('temperature_2m,weather_code,is_day');
  });
  it('carries the hours past midnight', async () => {
    respond(forecastBody('2026-10-09T21:15'));
    const { hours } = await forecast(berlin, 'celsius');
    expect(hours.map((h) => h.time)).toEqual([
      '22:00',
      '23:00',
      '00:00',
      '01:00',
      '02:00',
      '03:00',
    ]);
  });
  it('reuses a forecast for 30 minutes per place and unit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
    const fetch = respond(forecastBody('2026-10-09T13:45'));
    await forecast(berlin, 'celsius');
    vi.setSystemTime(new Date('2026-10-09T12:20:00Z'));
    await forecast(berlin, 'celsius');
    expect(fetch).toHaveBeenCalledTimes(1);
    await forecast(berlin, 'fahrenheit');
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date('2026-10-09T12:31:00Z'));
    await forecast(berlin, 'celsius');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('explains a failed response', async () => {
    respond({ error: true, reason: 'Invalid latitude' }, 400);
    await expect(forecast(berlin, 'celsius')).rejects.toThrow(
      'The weather service isn’t answering right now (error 400).',
    );
  });
});
