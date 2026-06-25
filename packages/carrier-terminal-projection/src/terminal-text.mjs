const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function stripAnsi(text) {
  return String(text ?? '').replace(ANSI_PATTERN, '');
}

export function visibleLength(value) {
  return stripAnsi(value).length;
}

export function padVisible(value, width) {
  const text = String(value ?? '');
  return `${text}${' '.repeat(Math.max(0, width - visibleLength(text)))}`;
}

export function clampTerminalColumns(value, { min = 50, max = 120, fallback = 88 } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

export function terminalColumns({ columns = process.stdout.columns, min = 50, max = 120, fallback = 88 } = {}) {
  return clampTerminalColumns(columns, { min, max, fallback });
}

export function clearPreviousTerminalRows(rows) {
  if (rows <= 1) return '\x1b[1A\r\x1b[K';
  let sequence = `\x1b[${rows}A`;
  for (let index = 0; index < rows; index++) {
    sequence += '\r\x1b[2K';
    if (index < rows - 1) sequence += '\x1b[1B';
  }
  return `${sequence}\x1b[${rows - 1}A\r`;
}

export function formatTimestamp(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function wrapTerminalLine(line, width) {
  const text = String(line ?? '');
  if (text.trim() === '') return [''];
  if (stripAnsi(text).length <= width) return [text];
  const words = text.split(/(\s+)/);
  const lines = [];
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

export function wrapIndentedLines(text, { indent = '  ', columns = 88 } = {}) {
  const width = Math.max(10, columns - stripAnsi(indent).length);
  return String(text ?? '').split(/\r?\n/).flatMap((line) => (
    wrapTerminalLine(line, width).map((wrapped) => `${indent}${wrapped}`)
  ));
}
