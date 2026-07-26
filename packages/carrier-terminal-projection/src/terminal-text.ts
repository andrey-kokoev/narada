const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export interface TerminalColumnOptions {
  [key: string]: unknown;
  columns?: unknown;
  terminalColumns?: unknown;
  min?: number;
  max?: number;
  fallback?: number;
}

export interface IndentedLineOptions {
  indent?: string;
  columns?: number;
}

export function stripAnsi(text: unknown): string {
  return String(text ?? '').replace(ANSI_PATTERN, '');
}

export function visibleLength(value: unknown): number {
  return stripAnsi(value).length;
}

export function padVisible(value: unknown, width: number): string {
  const text = String(value ?? '');
  return `${text}${' '.repeat(Math.max(0, width - visibleLength(text)))}`;
}

export function clampTerminalColumns(value: unknown, { min = 50, max = 120, fallback = 88 }: TerminalColumnOptions = {}): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

export function terminalColumns({ columns = undefined, terminalColumns: projectedColumns = undefined, min = 50, max = 120, fallback = 88 }: TerminalColumnOptions = {}): number {
  return clampTerminalColumns(columns ?? projectedColumns ?? process.stdout.columns, { min, max, fallback });
}

export function clearPreviousTerminalRows(rows: number): string {
  if (rows <= 1) return '\x1b[1A\r\x1b[K';
  let sequence = `\x1b[${rows}A`;
  for (let index = 0; index < rows; index++) {
    sequence += '\r\x1b[2K';
    if (index < rows - 1) sequence += '\x1b[1B';
  }
  return `${sequence}\x1b[${rows - 1}A\r`;
}

export function formatTimestamp(now: Date | string | number = new Date()): string {
  const date = now instanceof Date ? now : new Date(now);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function wrapTerminalLine(line: unknown, width: number): string[] {
  const text = String(line ?? '');
  if (text.trim() === '') return [''];
  if (stripAnsi(text).length <= width) return [text];
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!word) continue;
    if (stripAnsi(word).length > width) {
      if (current.trim()) {
        lines.push(current.trimEnd());
        current = '';
      }
      let remaining = word.trimStart();
      while (stripAnsi(remaining).length > width) {
        lines.push(remaining.slice(0, width));
        remaining = remaining.slice(width);
      }
      current = remaining;
      continue;
    }
    if (stripAnsi(current + word).length > width && current.trim()) {
      lines.push(current.trimEnd());
      current = word.trimStart();
    } else {
      current += word;
    }
  }
  if (current.trim()) lines.push(current.trimEnd());
  return lines.length ? lines : [text];
}

export function wrapIndentedLines(text: unknown, { indent = '  ', columns = 88 }: IndentedLineOptions = {}): string[] {
  const width = Math.max(10, columns - stripAnsi(indent).length);
  return String(text ?? '').split(/\r?\n/).flatMap((line) => (
    wrapTerminalLine(line, width).map((wrapped) => `${indent}${wrapped}`)
  ));
}
