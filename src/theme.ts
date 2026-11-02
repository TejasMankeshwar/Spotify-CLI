import { hex, bold, dim } from './ui/ansi.ts';

export type ThemeName = 'gemini' | 'claude' | 'cyber';

export interface ThemeColors {
  primary: (text: string) => string;
  secondary: (text: string) => string;
  accent: (text: string) => string;
  muted: (text: string) => string;
  playing: (text: string) => string;
  paused: (text: string) => string;
  border: (text: string) => string;
  text: (text: string) => string;
  heading: (text: string) => string;
  symbol: string;
  promptSymbol: string;
  name: ThemeName;
}

const geminiTheme: ThemeColors = {
  name: 'gemini',
  primary: (t: string) => hex('#38bdf8', t),       // Sky/cyan
  secondary: (t: string) => hex('#818cf8', t),     // Indigo
  accent: (t: string) => hex('#60a5fa', t),        // Blue spark
  muted: (t: string) => hex('#64748b', t),         // Slate muted
  playing: (t: string) => hex('#10b981', t),       // Emerald
  paused: (t: string) => hex('#f59e0b', t),        // Amber
  border: (t: string) => hex('#334155', t),        // Dark slate border
  text: (t: string) => hex('#f1f5f9', t),          // Bright text
  heading: (t: string) => bold(hex('#ffffff', t)), // Crisp bold heading
  symbol: '✦',
  promptSymbol: '❯',
};

const claudeTheme: ThemeColors = {
  name: 'claude',
  primary: (t: string) => hex('#d97706', t),       // Warm amber/terracotta
  secondary: (t: string) => hex('#ea580c', t),     // Rust/burnt orange
  accent: (t: string) => hex('#fb923c', t),        // Soft orange
  muted: (t: string) => hex('#78716c', t),         // Stone muted
  playing: (t: string) => hex('#10b981', t),       // Emerald
  paused: (t: string) => hex('#f59e0b', t),        // Amber
  border: (t: string) => hex('#44403c', t),        // Stone border
  text: (t: string) => hex('#fafaf9', t),          // Crisp warm white
  heading: (t: string) => bold(hex('#ffffff', t)),
  symbol: '●',
  promptSymbol: '❯',
};

const cyberTheme: ThemeColors = {
  name: 'cyber',
  primary: (t: string) => hex('#06b6d4', t),       // Electric cyan
  secondary: (t: string) => hex('#ec4899', t),     // Neon pink
  accent: (t: string) => hex('#a855f7', t),        // Neon purple
  muted: (t: string) => hex('#475569', t),
  playing: (t: string) => hex('#22c55e', t),
  paused: (t: string) => hex('#eab308', t),
  border: (t: string) => hex('#1e293b', t),
  text: (t: string) => hex('#f8fafc', t),
  heading: (t: string) => bold(hex('#38bdf8', t)),
  symbol: '◆',
  promptSymbol: '›',
};

const themes: Record<ThemeName, ThemeColors> = {
  gemini: geminiTheme,
  claude: claudeTheme,
  cyber: cyberTheme,
};

let currentTheme: ThemeColors = geminiTheme;

export function setTheme(name: ThemeName): ThemeColors {
  if (themes[name]) {
    currentTheme = themes[name];
  }
  return currentTheme;
}

export function getTheme(): ThemeColors {
  return currentTheme;
}

export function listThemes(): ThemeName[] {
  return Object.keys(themes) as ThemeName[];
}

