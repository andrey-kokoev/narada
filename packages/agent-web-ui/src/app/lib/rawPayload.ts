export function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function stringifyRawPayload(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return `raw payload unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}
