export type CliFormat = 'json' | 'human' | 'auto';

export function wantsJsonOutput(format?: unknown, envFormat = process.env.OUTPUT_FORMAT): boolean {
  return format === 'json' || envFormat === 'json';
}

export function resolveCommandFormat(
  format?: unknown,
  fallback: CliFormat = 'auto',
  envFormat = process.env.OUTPUT_FORMAT,
): CliFormat {
  if (envFormat === 'json') return 'json';
  if (format === 'json' || format === 'human') return format;
  if (envFormat === 'human' || envFormat === 'auto') return envFormat;
  if (format === 'auto') return format;
  return fallback;
}

export function formatCommandResultForStdout(
  result: unknown,
  format?: unknown,
  envFormat = process.env.OUTPUT_FORMAT,
): string {
  if (wantsJsonOutput(format, envFormat)) {
    return JSON.stringify(result, null, 2);
  }
  if (result && typeof result === 'object' && '_formatted' in result) {
    return String((result as { _formatted: unknown })._formatted);
  }
  if (result && typeof result === 'object') {
    return JSON.stringify(result, null, 2);
  }
  return typeof result === 'string' ? result : String(result);
}

export function emitCommandResult(result: unknown, format?: unknown): void {
  console.log(formatCommandResultForStdout(result, format));
}

export function attachFormattedOutput<T extends Record<string, unknown>>(
  result: T,
  formatted: string,
  format: CliFormat,
): T | (T & { _formatted: string }) {
  return format === 'json' ? result : { ...result, _formatted: formatted };
}
