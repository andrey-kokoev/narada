import type { PiTheme } from '../types.js';
import { resetAnsi } from '../theme/theme.js';

export function renderSelectorOverlay(title: string, values: readonly string[], selected: number, width: number, theme: PiTheme): string[] {
  return [
    `${theme.accent}${title}${resetAnsi('')}`,
    ...values.map((value, index) => `${index === selected ? theme.accent : theme.muted}${index === selected ? '> ' : '  '}${value.slice(0, Math.max(1, width - 2))}${resetAnsi('')}`),
  ];
}

