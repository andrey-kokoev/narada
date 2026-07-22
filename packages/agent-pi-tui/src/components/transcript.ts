import type { PiRowViewModel, PiTheme } from '../types.js';
import { renderRows } from './render-utils.js';

export function renderTranscript(rows: readonly PiRowViewModel[], width: number, theme: PiTheme, expanded: ReadonlySet<string> = new Set()): string[] {
  return renderRows(rows, width, theme, expanded);
}

