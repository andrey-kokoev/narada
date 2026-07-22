import type { PiRowViewModel, PiTheme } from '../types.js';
import { renderRow } from './render-utils.js';

export function renderDiagnosticRow(row: PiRowViewModel, width: number, theme: PiTheme, expanded = false): string[] {
  return renderRow(row, width, theme, expanded);
}

