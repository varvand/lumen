/** Weather for the Home screen from Open-Meteo's free APIs, which need no key. */

export type TemperatureUnit = 'celsius' | 'fahrenheit';

export interface Place {
  name: string;
  /** First-level region (admin1), may be '' */
  region: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface Forecast {
  /** Rounded, like every temperature here. */
  temperature: number;
  /** Today's high. */
  high: number;
  /** Today's low. */
  low: number;
  /** WMO weather code. */
  code: number;
  isDay: boolean;
  /** Chance of precipitation today, 0–100 */
  precipitation: number;
  /** The next 6 hours starting with the coming full hour, in the place's local time */
  hours: { time: string; temperature: number; code: number }[];
  fetchedAt: number;
}

export type WeatherIcon =
  | 'sun'
  | 'moon'
  | 'cloud-sun'
  | 'cloud-moon'
  | 'cloud'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm';

const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'lumen.weather.';
const CACHE_FOR = 30 * 60 * 1000;
const HOURS = 6;

/** Fetches JSON, turning network and server failures into errors worth showing. */
async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Couldn’t reach the weather service. Check your internet connection.');
  }
  if (!response.ok)
    throw new Error(`The weather service isn’t answering right now (error ${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new Error('The weather service sent an answer Lumen couldn’t read.');
  }
}

/** Avoids showing "-0°". */
const round = (n: number) => Math.round(n) || 0;

interface GeocodingResponse {
  results?: {
    name: string;
    admin1?: string;
    country?: string;
    latitude: number;
    longitude: number;
  }[];
}

/** Up to 5 places matching a name; [] for a blank query. Throws a readable Error on network failure. */
export async function findPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const name = query.trim();
  if (!name) return [];
  const params = new URLSearchParams({ name, count: '5', language: 'en', format: 'json' });
  const data = (await getJson(`${GEOCODING}?${params}`, signal)) as GeocodingResponse;
  return (data.results ?? []).slice(0, 5).map((r) => ({
    name: r.name,
    region: r.admin1 ?? '',
    country: r.country ?? '',
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

interface ForecastResponse {
  current: { time: string; temperature_2m: number; weather_code: number; is_day: number };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
  };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[] };
}

/** Reads the forecast. Times are local to the place ("2026-10-09T14:00"), so they compare as text. */
function parseForecast(data: ForecastResponse, fetchedAt: number): Forecast {
  const { current, daily, hourly } = data;
  const next = hourly.time.findIndex((time) => time > current.time);
  const start = next === -1 ? hourly.time.length : next;
  return {
    temperature: round(current.temperature_2m),
    high: round(daily.temperature_2m_max[0]),
    low: round(daily.temperature_2m_min[0]),
    code: current.weather_code,
    isDay: current.is_day === 1,
    precipitation: round(daily.precipitation_probability_max[0] ?? 0),
    hours: hourly.time.slice(start, start + HOURS).map((time, i) => ({
      time: time.slice(11, 16),
      temperature: round(hourly.temperature_2m[start + i]),
      code: hourly.weather_code[start + i],
    })),
    fetchedAt,
  };
}

function cacheKey(place: Place, unit: TemperatureUnit) {
  return `${CACHE_KEY}${place.latitude},${place.longitude},${unit}`;
}

function cached(key: string): Forecast | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null') as Forecast | null;
    if (saved && Date.now() - saved.fetchedAt < CACHE_FOR) return saved;
  } catch {
    /* Fetch a fresh forecast instead. */
  }
  return undefined;
}

/** The forecast, cached in localStorage for 30 minutes per place and unit. */
export async function forecast(
  place: Place,
  unit: TemperatureUnit,
  signal?: AbortSignal,
): Promise<Forecast> {
  const key = cacheKey(place, unit);
  const saved = cached(key);
  if (saved) return saved;
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    hourly: 'temperature_2m,weather_code',
    timezone: 'auto',
    temperature_unit: unit,
    forecast_days: '2',
  });
  const data = (await getJson(`${FORECAST}?${params}`, signal)) as ForecastResponse;
  if (!data?.current || !data.daily || !data.hourly)
    throw new Error('The weather service sent an answer Lumen couldn’t read.');
  const result = parseForecast(data, Date.now());
  try {
    localStorage.setItem(key, JSON.stringify(result));
  } catch {
    /* Only saves a request next time. */
  }
  return result;
}

/** Labels and icons for WMO codes; day and night only differ for clear and partly cloudy skies. */
const WEATHER: Record<number, [label: string, icon: WeatherIcon]> = {
  0: ['Clear', 'sun'],
  1: ['Mostly clear', 'sun'],
  2: ['Partly cloudy', 'cloud-sun'],
  3: ['Overcast', 'cloud'],
  45: ['Fog', 'fog'],
  48: ['Freezing fog', 'fog'],
  51: ['Light drizzle', 'drizzle'],
  53: ['Drizzle', 'drizzle'],
  55: ['Heavy drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'drizzle'],
  57: ['Freezing drizzle', 'drizzle'],
  61: ['Light rain', 'rain'],
  63: ['Rain', 'rain'],
  65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'],
  67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'],
  75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Light showers', 'rain'],
  81: ['Showers', 'rain'],
  82: ['Heavy showers', 'rain'],
  85: ['Snow showers', 'snow'],
  86: ['Heavy snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm with hail', 'storm'],
  99: ['Thunderstorm with hail', 'storm'],
};
const NIGHT: Partial<Record<WeatherIcon, WeatherIcon>> = { sun: 'moon', 'cloud-sun': 'cloud-moon' };

/** A plain label ("Partly cloudy", "Light rain", …) and an icon for a WMO code. */
export function describeWeather(code: number, isDay = true): { label: string; icon: WeatherIcon } {
  const [label, icon] = WEATHER[code] ?? ['Unknown weather', 'cloud'];
  return { label, icon: isDay ? icon : (NIGHT[icon] ?? icon) };
}
