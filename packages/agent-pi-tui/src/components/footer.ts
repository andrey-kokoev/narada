import type { PiFooterModel } from '../projection/footer-model.js';
import type { PiTheme } from '../types.js';
import { resetAnsi } from '../theme/theme.js';
import { truncateVisible } from './render-utils.js';

export function renderFooter(model: PiFooterModel, width: number, theme: PiTheme): string {
  const separator = ' · ';
  const available = Math.max(1, width - separator.length);
  const leftWidth = Math.ceil(available * 0.6);
  return `${theme.muted}${truncateVisible(model.left, leftWidth)}${separator}${truncateVisible(model.right, available - leftWidth)}${resetAnsi('')}`;
}

