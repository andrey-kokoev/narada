import type { PiRowViewModel } from '../types.js';

export function diagnosticRows(rows: readonly PiRowViewModel[]): PiRowViewModel[] {
  return rows.filter((row) => row.projectionClass === 'diagnostics');
}

