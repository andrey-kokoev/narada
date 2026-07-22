import type { PiRowViewModel, PiTheme } from '../types.js';
import { renderRow } from './render-utils.js';

export function renderAssistantMessage(row: PiRowViewModel, width: number, theme: PiTheme): string[] {
  return renderRow(row, width, theme);
}

