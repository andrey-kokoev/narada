import type { PiTheme } from '../types.js';

export const darkPiTheme: PiTheme = Object.freeze({
  name: 'dark',
  accent: '\u001b[38;5;81m',
  muted: '\u001b[38;5;244m',
  assistant: '\u001b[38;5;117m',
  operator: '\u001b[38;5;220m',
  tool: '\u001b[38;5;141m',
  success: '\u001b[38;5;114m',
  warning: '\u001b[38;5;215m',
  error: '\u001b[38;5;203m',
  diagnostic: '\u001b[38;5;109m',
});

export const lightPiTheme: PiTheme = Object.freeze({
  name: 'light',
  accent: '\u001b[38;5;25m',
  muted: '\u001b[38;5;102m',
  assistant: '\u001b[38;5;24m',
  operator: '\u001b[38;5;130m',
  tool: '\u001b[38;5;91m',
  success: '\u001b[38;5;28m',
  warning: '\u001b[38;5;130m',
  error: '\u001b[38;5;124m',
  diagnostic: '\u001b[38;5;30m',
});

export const PI_THEMES = Object.freeze({ dark: darkPiTheme, light: lightPiTheme });

export function resolveTheme(name: string | undefined): PiTheme {
  return name && name.toLowerCase() === 'light' ? lightPiTheme : darkPiTheme;
}

export function resetAnsi(value: string): string {
  return `${value}\u001b[0m`;
}

