export type CliFormat = 'json' | 'human' | 'auto';
export type CliOutputAdmissionZone = 'finite' | 'interactive' | 'long_lived';
export type CliOutputAdmissionStream = 'stdout' | 'stderr';

export interface CliOutputAdmission {
  zone: CliOutputAdmissionZone;
  stream?: CliOutputAdmissionStream;
  lines: string[];
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export interface CliExitAdmission {
  zone: CliOutputAdmissionZone;
  code?: number;
  exit?: (code: number) => never;
}

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
  emitCliOutputAdmission({
    zone: 'finite',
    lines: [formatCommandResultForStdout(result, format)],
  });
}

export function emitCliOutputAdmission(admission: CliOutputAdmission): void {
  const stream = admission.stream ?? 'stdout';
  const write =
    stream === 'stderr'
      ? admission.stderr ?? console.error
      : admission.stdout ?? console.log;
  for (const line of admission.lines) {
    write(line);
  }
}

export function exitCliOutputAdmission(admission: CliExitAdmission): never {
  const exit = admission.exit ?? ((code: number): never => process.exit(code));
  return exit(admission.code ?? 0);
}

export interface CommandResultEnvelopeLike {
  exitCode: number;
  result: unknown;
}

// Finite commands return an envelope; this function is the stdout/exit admission point.
export function emitFiniteCommandResult(
  envelope: CommandResultEnvelopeLike,
  options: {
    format?: unknown;
    exit?: (code: number) => never;
  } = {},
): void {
  emitCommandResult(envelope.result, options.format);
  if (envelope.exitCode !== 0) {
    exitCliOutputAdmission({ zone: 'finite', code: envelope.exitCode, exit: options.exit });
  }
}

// Use for finite command failures that are thrown before a normal envelope exists.
export function emitFiniteCommandFailure(
  message: string,
  options: {
    exitCode?: number;
    exit?: (code: number) => never;
  } = {},
): never {
  emitCliOutputAdmission({ zone: 'finite', stream: 'stderr', lines: [message] });
  return exitCliOutputAdmission({ zone: 'finite', code: options.exitCode ?? 1, exit: options.exit });
}

// Use when the command body has already rendered human output through Formatter.
export function emitFormatterBackedCommandResult(
  envelope: CommandResultEnvelopeLike,
  options: {
    format?: unknown;
    errorFallback?: string;
    exit?: (code: number) => never;
  } = {},
): void {
  if (envelope.exitCode !== 0) {
    emitCliOutputAdmission({
      zone: 'finite',
      stream: 'stderr',
      lines: [(envelope.result as { error?: string }).error ?? options.errorFallback ?? 'Command failed'],
    });
    exitCliOutputAdmission({ zone: 'finite', code: envelope.exitCode, exit: options.exit });
    return;
  }
  if (wantsJsonOutput(options.format)) {
    emitCliOutputAdmission({ zone: 'finite', lines: [JSON.stringify(envelope.result, null, 2)] });
  } else if (envelope.result && typeof envelope.result === 'object' && '_formatted' in envelope.result) {
    emitCliOutputAdmission({ zone: 'finite', lines: [String((envelope.result as { _formatted: unknown })._formatted)] });
  }
}

// Long-lived commands are an explicit exception: startup notices precede process lifetime.
export function emitLongLivedCommandStartup(lines: string[]): void {
  emitCliOutputAdmission({ zone: 'long_lived', lines });
}

// Long-lived commands may terminate process lifetime after graceful shutdown.
export function exitLongLivedCommandSuccessfully(exit?: (code: number) => never): never {
  return exitCliOutputAdmission({ zone: 'long_lived', exit });
}

// Interactive commands may terminate process lifetime after prompt cancellation.
export function exitInteractiveCommandSuccessfully(exit?: (code: number) => never): never {
  return exitCliOutputAdmission({ zone: 'interactive', exit });
}

// Interactive commands sometimes need bounded follow-up text after prompt rendering.
export function emitInteractiveCommandFollowUp(lines: string[]): void {
  emitCliOutputAdmission({ zone: 'interactive', lines });
}

// Finite setup commands may render bounded progress summaries while they mutate local scaffolding.
export function emitFiniteCommandProgress(lines: string[]): void {
  emitCliOutputAdmission({ zone: 'finite', lines });
}

// Finite setup commands may render bounded diagnostics before returning a failing envelope or throwing.
export function emitFiniteCommandDiagnostics(lines: string[]): void {
  emitCliOutputAdmission({ zone: 'finite', stream: 'stderr', lines });
}

// Finite command bodies should construct human output here, not write to stdout directly.
export function attachFormattedOutput<T extends object>(
  result: T,
  formatted: string,
  format: CliFormat,
): T | (T & { _formatted: string }) {
  return format === 'json' ? result : { ...result, _formatted: formatted };
}

// Preferred ergonomic helper for finite command results with human rendering.
export function formattedResult<T extends object>(
  result: T,
  formatted: string | string[],
  format: CliFormat,
): T | (T & { _formatted: string }) {
  const text = Array.isArray(formatted) ? formatted.join('\n') : formatted;
  return attachFormattedOutput(result, text, format);
}
