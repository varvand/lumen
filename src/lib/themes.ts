/** Every color token the interface reads, in the order the theme editor shows them. */
export const TOKENS = [
  'background',
  'surface',
  'sidebar',
  'hover',
  'text',
  'secondary',
  'muted',
  'border',
  'accent',
  'accent-strong',
  'accent-soft',
  'selection',
  'danger',
] as const;
export type Token = (typeof TOKENS)[number];
export type ThemeColors = Record<Token, string>;

export interface ThemeDefinition {
  id: string;
  name: string;
  /** Dark themes get dark native controls, scrollbars and a deeper shadow. */
  dark: boolean;
  colors: ThemeColors;
  custom?: boolean;
}

export const TOKEN_LABELS: Record<Token, string> = {
  background: 'Page',
  surface: 'Surface',
  sidebar: 'Sidebar',
  hover: 'Hover',
  text: 'Text',
  secondary: 'Secondary text',
  muted: 'Muted text',
  border: 'Borders',
  accent: 'Accent',
  'accent-strong': 'Accent, strong',
  'accent-soft': 'Accent, soft',
  selection: 'Selection',
  danger: 'Danger',
};

export const BUILTIN_THEMES: ThemeDefinition[] = [
  {
    id: 'light',
    name: 'Light',
    dark: false,
    colors: {
      background: '#ffffff',
      surface: '#f8f9f8',
      sidebar: '#f2f4f2',
      hover: '#ebeeeb',
      text: '#292f2b',
      secondary: '#626b65',
      muted: '#7e8780',
      border: '#e7ebe7',
      accent: '#37644d',
      'accent-strong': '#28543d',
      'accent-soft': '#e7eee8',
      selection: '#dbe9df',
      danger: '#a2493c',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    dark: true,
    colors: {
      background: '#1b201d',
      surface: '#202623',
      sidebar: '#181d1a',
      hover: '#2c332e',
      text: '#e4e9e5',
      secondary: '#a7b2aa',
      muted: '#8c9990',
      border: '#303a33',
      accent: '#a5c9ae',
      'accent-strong': '#b8d7bf',
      'accent-soft': '#2e4033',
      selection: '#3d5443',
      danger: '#e1a093',
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    dark: false,
    colors: {
      background: '#fbf6ec',
      surface: '#f5eee0',
      sidebar: '#efe6d4',
      hover: '#e7dcc6',
      text: '#3b3228',
      secondary: '#6b5d4c',
      muted: '#857662',
      border: '#e4d8c2',
      accent: '#9a5b2e',
      'accent-strong': '#7f4720',
      'accent-soft': '#f1e1cf',
      selection: '#ecd5b8',
      danger: '#a2493c',
    },
  },
  {
    id: 'mist',
    name: 'Mist',
    dark: false,
    colors: {
      background: '#fbfcfe',
      surface: '#f4f7fb',
      sidebar: '#edf1f7',
      hover: '#e3e9f2',
      text: '#1f2733',
      secondary: '#556070',
      muted: '#768091',
      border: '#e1e7ef',
      accent: '#3a5f9e',
      'accent-strong': '#2c4c84',
      'accent-soft': '#e4ecf8',
      selection: '#d3e0f5',
      danger: '#b0443a',
    },
  },
  {
    id: 'night',
    name: 'Night',
    dark: true,
    colors: {
      background: '#1f2430',
      surface: '#252b38',
      sidebar: '#1a1f29',
      hover: '#2f3746',
      text: '#e2e7ef',
      secondary: '#a9b3c3',
      muted: '#8792a5',
      border: '#333c4d',
      accent: '#8fb3e6',
      'accent-strong': '#a7c4ee',
      'accent-soft': '#2c3a52',
      selection: '#3a4c6b',
      danger: '#e59b91',
    },
  },
  {
    id: 'dusk',
    name: 'Dusk',
    dark: true,
    colors: {
      background: '#221f2a',
      surface: '#282432',
      sidebar: '#1c1a23',
      hover: '#332e3f',
      text: '#ebe6f2',
      secondary: '#b3abc2',
      muted: '#938aa5',
      border: '#3a3447',
      accent: '#c6a8ec',
      'accent-strong': '#d6bff3',
      'accent-soft': '#3a2f4d',
      selection: '#4a3d63',
      danger: '#eba0a0',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    dark: true,
    colors: {
      background: '#0b0b0c',
      surface: '#141416',
      sidebar: '#000000',
      hover: '#1e1f22',
      text: '#e8e8ea',
      secondary: '#a5a6ab',
      muted: '#85868c',
      border: '#26272b',
      accent: '#9ccfb0',
      'accent-strong': '#b4dcc3',
      'accent-soft': '#1c2a22',
      selection: '#2c4436',
      danger: '#ef9a8c',
    },
  },
];

const [LIGHT, DARK] = BUILTIN_THEMES;
const HEX = /^#[0-9a-f]{6}$/i;

/** Rebuild a stored custom theme, dropping it if it is unusable and filling any missing colors. */
export function sanitizeTheme(value: unknown): ThemeDefinition | null {
  if (!value || typeof value !== 'object') return null;
  const { id, name, dark, colors } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !id.startsWith('custom-')) return null;
  const base = dark === true ? DARK : LIGHT;
  const stored = colors && typeof colors === 'object' ? (colors as Record<string, unknown>) : {};
  const sanitized = Object.fromEntries(
    TOKENS.map((token) => {
      const color = stored[token];
      return [token, typeof color === 'string' && HEX.test(color) ? color : base.colors[token]];
    }),
  ) as ThemeColors;
  return {
    id,
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : 'Custom theme',
    dark: dark === true,
    colors: sanitized,
    custom: true,
  };
}

/** Find the theme to display. "system" follows the OS between Light and Dark. */
export function resolveTheme(
  id: string,
  custom: ThemeDefinition[],
  prefersDark: boolean,
): ThemeDefinition {
  if (id === 'system') return prefersDark ? DARK : LIGHT;
  return BUILTIN_THEMES.find((t) => t.id === id) ?? custom.find((t) => t.id === id) ?? LIGHT;
}

/** Inline CSS custom properties for a theme. */
export function themeStyle(theme: ThemeDefinition) {
  const vars = TOKENS.map((token) => `--${token}: ${theme.colors[token]}`);
  vars.push(`--shadow: ${theme.dark ? '0 20px 80px #0005' : '0 20px 80px #17271b1c'}`);
  vars.push(`color-scheme: ${theme.dark ? 'dark' : 'light'}`);
  return vars.join('; ');
}

export function newThemeId() {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
