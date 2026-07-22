import type { PiRowViewModel } from '../types.js';

export function operationRows(rows: readonly PiRowViewModel[]): PiRowViewModel[] {
  return rows.filter((row) => row.projectionClass === 'operations');
}

