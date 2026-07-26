export interface TerminalStyle {
  enabled: boolean;
  header: (text: string) => string;
  tool: (text: string) => string;
  assistant: (text: string) => string;
  bold: (text: string) => string;
  label: (text: string) => string;
  operator: (text: string) => string;
  operatorDirective: (text: string) => string;
  systemDirective: (text: string) => string;
  muted: (text: string) => string;
  source: (text: string) => string;
  timestamp: (text: string) => string;
  key: (text: string) => string;
  code: (text: string) => string;
  success: (text: string) => string;
  prompt: (text: string) => string;
  progress: (text: string) => string;
  warn: (text: string) => string;
  error: (text: string) => string;
}

interface TerminalMessageBlockOptions {
  label?: unknown;
  lines?: unknown;
  style?: TerminalStyle;
  labelStyle?: (value: string) => string;
  bodyStyle?: (value: string) => string;
  indent?: string;
}

export function createTerminalStyle({ enabled = true }: { enabled?: boolean } = {}): TerminalStyle {
  const color = (code: string, text: string): string => enabled ? `\x1b[${code}m${text}\x1b[0m` : text;
  return {
    enabled,
    header: (text) => color('36', text),
    tool: (text) => color('35', text),
    assistant: (text) => color('37', text),
    bold: (text) => color('1', text),
    label: (text) => color('1;36', text),
    operator: (text) => color('1;32', text),
    operatorDirective: (text) => color('1;33', text),
    systemDirective: (text) => color('1;35', text),
    muted: (text) => color('2', text),
    source: (text) => color('90', text),
    timestamp: (text) => color('38;5;240', text),
    key: (text) => color('33', text),
    code: (text) => color('90', text),
    success: (text) => color('32', text),
    prompt: (text) => color('1;32', text),
    progress: (text) => color('2;33', text),
    warn: (text) => color('33', text),
    error: (text) => color('38;5;167', text),
  };
}

export function formatTerminalMessageBlockLines({
  label,
  lines,
  style = createTerminalStyle({ enabled: false }),
  labelStyle = (value: string): string => value,
  bodyStyle = (value: string): string => value,
  indent = '  ',
}: TerminalMessageBlockOptions = {}): string[] {
  const bodyLines: unknown[] = Array.isArray(lines) ? lines : String(lines ?? '').split(/\r?\n/);
  return [
    `${labelStyle(String(label ?? ''))}${style.muted(':')}`,
    ...bodyLines.map((line) => `${indent}${bodyStyle(String(line ?? ''))}`),
  ];
}
