// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { preferences } from './preferences.svelte';
import { BUILTIN_THEMES, newThemeId, type ThemeDefinition } from './themes';

const KEY = 'lumen.preferences';
const [light, dark] = BUILTIN_THEMES;

function stored() {
  return JSON.parse(localStorage.getItem(KEY) || '{}');
}
function custom(patch: Partial<ThemeDefinition> = {}): ThemeDefinition {
  return {
    ...dark,
    colors: { ...dark.colors },
    id: newThemeId(),
    name: 'Mine',
    custom: true,
    ...patch,
  };
}
function mockSystemDark(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches,
    addEventListener: () => {},
  } as unknown as MediaQueryList);
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  mockSystemDark(false);
  preferences.preview = null;
  preferences.load();
});

describe('preferences', () => {
  it('starts with defaults when nothing is stored', () => {
    expect(preferences.theme).toBe('light');
    expect(preferences.customThemes).toEqual([]);
    expect(preferences.readerFont).toBe('serif');
    expect(preferences.fontSize).toBe(17);
    expect(preferences.active).toBe(light);
  });

  it('repairs invalid stored values', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        theme: 'no-such-theme',
        readerFont: 'comic',
        fontSize: 99,
        customThemes: [{ id: 'custom-ok', name: 'Ok', colors: { accent: '#123456' } }, 'junk'],
      }),
    );
    preferences.load();
    expect(preferences.theme).toBe('light');
    expect(preferences.readerFont).toBe('serif');
    expect(preferences.fontSize).toBe(22);
    expect(preferences.customThemes.map((t) => t.id)).toEqual(['custom-ok']);
    expect(preferences.customThemes[0].colors.accent).toBe('#123456');
  });

  it('survives unreadable JSON', () => {
    localStorage.setItem(KEY, '{nope');
    expect(() => preferences.load()).not.toThrow();
  });

  it('persists changes and reloads them', () => {
    preferences.set({ theme: 'paper', readerFont: 'sans', fontSize: 19 });
    expect(stored()).toMatchObject({ theme: 'paper', readerFont: 'sans', fontSize: 19 });
    preferences.load();
    expect(preferences.active.name).toBe('Paper');
    expect(preferences.readerFont).toBe('sans');
  });

  it('follows the operating system for the system theme', () => {
    preferences.set({ theme: 'system' });
    expect(preferences.active).toBe(light);
    mockSystemDark(true);
    preferences.load();
    expect(preferences.active).toBe(dark);
  });

  it('saves a custom theme, selects it, and keeps it after reload', () => {
    const theme = custom();
    preferences.saveCustomTheme(theme);
    expect(preferences.theme).toBe(theme.id);
    expect(preferences.active.colors).toEqual(theme.colors);
    preferences.load();
    expect(preferences.active.name).toBe('Mine');
  });

  it('replaces a custom theme with the same id instead of duplicating it', () => {
    const theme = custom();
    preferences.saveCustomTheme(theme);
    preferences.saveCustomTheme({ ...theme, name: 'Renamed' });
    expect(preferences.customThemes).toHaveLength(1);
    expect(preferences.active.name).toBe('Renamed');
  });

  it('falls back to a matching built-in when the active custom theme is deleted', () => {
    const darkTheme = custom({ dark: true });
    const lightTheme = custom({ dark: false, colors: { ...light.colors } });
    preferences.saveCustomTheme(lightTheme);
    preferences.saveCustomTheme(darkTheme);
    preferences.deleteCustomTheme(darkTheme.id);
    expect(preferences.theme).toBe('dark');
    preferences.set({ theme: lightTheme.id });
    preferences.deleteCustomTheme(lightTheme.id);
    expect(preferences.theme).toBe('light');
    expect(stored().customThemes).toEqual([]);
  });

  it('keeps the current theme when deleting another one', () => {
    const theme = custom();
    preferences.saveCustomTheme(theme);
    preferences.set({ theme: 'dusk' });
    preferences.deleteCustomTheme(theme.id);
    expect(preferences.theme).toBe('dusk');
  });

  it('shows a preview without saving it', () => {
    const theme = custom({ name: 'Draft' });
    preferences.preview = theme;
    expect(preferences.active).toEqual(theme);
    expect(stored().customThemes ?? []).toEqual([]);
    preferences.preview = null;
    expect(preferences.active).toBe(light);
  });
});
