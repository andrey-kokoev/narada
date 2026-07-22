import type { PiTheme } from '../types.js';
import { resetAnsi } from '../theme/theme.js';
import { truncateVisible } from './render-utils.js';

export function renderComposer(draft: string, width: number, theme: PiTheme): string {
  return `${theme.accent}> ${theme.operator}${truncateVisible(draft || ' ', Math.max(1, width - 2))}${resetAnsi('')}`;
}

