import type { PiRowViewModel, PiTheme } from '../types.js';
import { renderRow } from './render-utils.js';

export function renderArtifactRow(row: PiRowViewModel, width: number, theme: PiTheme): string[] {
  return renderRow(row, width, theme, true);
}

