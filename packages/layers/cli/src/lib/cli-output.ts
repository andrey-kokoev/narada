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
  if (format === 'json' || format === 'human' || format === 'auto') return format;
  if (envFormat === 'human' || envFormat === 'auto') return envFormat;
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
  return typeof result === 'string' ? result : String(result);
}

export function emitCommandResult(result: unknown, format?: unknown): void {
  console.log(formatCommandResultForStdout(result, format));
}
