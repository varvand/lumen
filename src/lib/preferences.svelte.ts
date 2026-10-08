import { BUILTIN_THEMES, resolveTheme, sanitizeTheme, type ThemeDefinition } from './themes';

const KEY = 'lumen.preferences';
/** "system", a built-in theme id, or a custom theme id. */
export type Theme = string;
export type ReaderFont = 'serif' | 'sans';
/** Interface text scale, separate from the document text size. */
export const UI_SCALE = { min: 0.85, max: 1.3, step: 0.05 };
const clampScale = (value: number) =>
  Math.round(Math.min(UI_SCALE.max, Math.max(UI_SCALE.min, value)) * 100) / 100;

/** Visual preferences, kept per device in localStorage and never mixed with library data. */
class Preferences {
  theme = $state<Theme>('light');
  customThemes = $state<ThemeDefinition[]>([]);
  readerFont = $state<ReaderFont>('serif');
  fontSize = $state(17);
  uiScale = $state(1);
  /** Give each tag its own color instead of the neutral tag style. */
  colorfulTags = $state(false);
  /** Render Markdown in the editor, showing the source only on the lines being edited. */
  livePreview = $state(true);
  /** A theme being edited, shown live without being saved. */
  preview = $state<ThemeDefinition | null>(null);
  prefersDark = $state(false);

  active = $derived(this.preview ?? resolveTheme(this.theme, this.customThemes, this.prefersDark));

  load() {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (query) {
      this.prefersDark = query.matches;
      query.addEventListener('change', (e) => (this.prefersDark = e.matches));
    }
    try {
      const prefs = JSON.parse(localStorage.getItem(KEY) || '{}');
      this.customThemes = Array.isArray(prefs.customThemes)
        ? prefs.customThemes.map(sanitizeTheme).filter((t: ThemeDefinition | null) => t !== null)
        : [];
      this.theme = this.isKnown(prefs.theme) ? prefs.theme : 'light';
      this.readerFont = prefs.readerFont === 'sans' ? 'sans' : 'serif';
      this.fontSize =
        typeof prefs.fontSize === 'number' ? Math.min(22, Math.max(14, prefs.fontSize)) : 17;
      this.uiScale = typeof prefs.uiScale === 'number' ? clampScale(prefs.uiScale) : 1;
      this.colorfulTags = prefs.colorfulTags === true;
      this.livePreview = prefs.livePreview !== false;
    } catch {
      /* Ignore invalid visual preferences, never library data. */
    }
  }
  set(
    patch: Partial<
      Pick<
        Preferences,
        | 'theme'
        | 'readerFont'
        | 'fontSize'
        | 'uiScale'
        | 'colorfulTags'
        | 'livePreview'
        | 'customThemes'
      >
    >,
  ) {
    Object.assign(this, patch);
    if (patch.uiScale !== undefined) this.uiScale = clampScale(patch.uiScale);
    const { theme, readerFont, fontSize, uiScale, colorfulTags, livePreview, customThemes } = this;
    localStorage.setItem(
      KEY,
      JSON.stringify({
        theme,
        readerFont,
        fontSize,
        uiScale,
        colorfulTags,
        livePreview,
        customThemes,
      }),
    );
  }
  /** Grow or shrink interface text by one step; 0 resets it. */
  stepUiScale(direction: -1 | 0 | 1) {
    this.set({ uiScale: direction ? this.uiScale + direction * UI_SCALE.step : 1 });
  }
  /** Add or replace a custom theme and switch to it. */
  saveCustomTheme(theme: ThemeDefinition) {
    const saved = { ...theme, custom: true, colors: { ...theme.colors } };
    const exists = this.customThemes.some((t) => t.id === saved.id);
    this.set({
      customThemes: exists
        ? this.customThemes.map((t) => (t.id === saved.id ? saved : t))
        : [...this.customThemes, saved],
      theme: saved.id,
    });
  }
  deleteCustomTheme(id: string) {
    const removed = this.customThemes.find((t) => t.id === id);
    this.set({
      customThemes: this.customThemes.filter((t) => t.id !== id),
      theme: this.theme === id ? (removed?.dark ? 'dark' : 'light') : this.theme,
    });
  }
  private isKnown(id: unknown) {
    return (
      typeof id === 'string' &&
      (id === 'system' ||
        BUILTIN_THEMES.some((t) => t.id === id) ||
        this.customThemes.some((t) => t.id === id))
    );
  }
}

export const preferences = new Preferences();
