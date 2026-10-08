import { BUILTIN_THEMES, resolveTheme, sanitizeTheme, type ThemeDefinition } from './themes';

const KEY = 'lumen.preferences';
/** "system", a built-in theme id, or a custom theme id. */
export type Theme = string;
export type ReaderFont = 'serif' | 'sans';

/** Visual preferences, kept per device in localStorage and never mixed with library data. */
class Preferences {
  theme = $state<Theme>('light');
  customThemes = $state<ThemeDefinition[]>([]);
  readerFont = $state<ReaderFont>('serif');
  fontSize = $state(17);
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
    } catch {
      /* Ignore invalid visual preferences, never library data. */
    }
  }
  set(patch: Partial<Pick<Preferences, 'theme' | 'readerFont' | 'fontSize' | 'customThemes'>>) {
    Object.assign(this, patch);
    const { theme, readerFont, fontSize, customThemes } = this;
    localStorage.setItem(KEY, JSON.stringify({ theme, readerFont, fontSize, customThemes }));
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
