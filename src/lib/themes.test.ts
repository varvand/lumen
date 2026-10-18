import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES, TOKENS, resolveTheme, sanitizeTheme, themeStyle } from './themes';

const light = BUILTIN_THEMES.find((t) => t.id === 'light')!;
const dark = BUILTIN_THEMES.find((t) => t.id === 'dark')!;

describe('themes', () => {
  it('defines every token as six-digit hex in each built-in theme', () => {
    for (const theme of BUILTIN_THEMES)
      for (const token of TOKENS) expect(theme.colors[token]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('resolves system, built-in, custom, and unknown ids', () => {
    const custom = sanitizeTheme({ id: 'custom-a', name: 'Mine', dark: true, colors: {} })!;
    expect(resolveTheme('system', [], false)).toBe(light);
    expect(resolveTheme('system', [], true)).toBe(dark);
    expect(resolveTheme('dusk', [], false).name).toBe('Dusk');
    expect(resolveTheme('custom-a', [custom], false)).toBe(custom);
    expect(resolveTheme('missing', [custom], true)).toBe(light);
  });

  it('offers Liquid Glass as a dark built-in with the glass design', () => {
    const glass = resolveTheme('liquid-glass', [], false);
    expect(glass.name).toBe('Liquid Glass');
    expect(glass.dark).toBe(true);
    expect(glass.glass).toBe(true);
    expect(BUILTIN_THEMES.filter((t) => t.glass)).toEqual([glass]);
  });

  it('keeps the glass design only on custom copies that have it', () => {
    expect(sanitizeTheme({ id: 'custom-g', dark: true, glass: true })!.glass).toBe(true);
    expect(sanitizeTheme({ id: 'custom-h', dark: true, glass: 'yes' })!.glass).toBeUndefined();
    expect(sanitizeTheme({ id: 'custom-i', dark: true })!.glass).toBeUndefined();
  });

  it('repairs stored custom themes and rejects unusable ones', () => {
    const theme = sanitizeTheme({
      id: 'custom-b',
      name: '  ',
      dark: true,
      colors: { accent: '#123456', text: 'red; background: url(x)' },
    })!;
    expect(theme.name).toBe('Custom theme');
    expect(theme.colors.accent).toBe('#123456');
    expect(theme.colors.text).toBe(dark.colors.text);
    expect(theme.colors.background).toBe(dark.colors.background);
    expect(sanitizeTheme({ id: 'light', colors: {} })).toBeNull();
    expect(sanitizeTheme('nope')).toBeNull();
  });

  it('emits CSS variables and color scheme', () => {
    const style = themeStyle(dark);
    expect(style).toContain(`--accent-strong: ${dark.colors['accent-strong']}`);
    expect(style).toContain('color-scheme: dark');
  });
});
