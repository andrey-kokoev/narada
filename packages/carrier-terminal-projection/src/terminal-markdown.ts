import { createTerminalStyle } from './terminal-style.js';
import type { TerminalStyle } from './terminal-style.js';
import { padVisible, visibleLength } from './terminal-text.js';

type TerminalStyleOverrides = Partial<TerminalStyle>;

export interface MarkdownStreamState {
  inFence: boolean;
}

function terminalMarkdownStyle(style: TerminalStyleOverrides = {}): TerminalStyle {
  return {
    ...createTerminalStyle({ enabled: false }),
    ...(style ?? {}),
  };
}

export function transformOutsideInlineCode(text: unknown, transform: (chunk: string) => string): string {
  return String(text ?? '').split(/(`[^`]*`)/g)
    .map((part) => part.startsWith('`') && part.endsWith('`') ? part : transform(part))
    .join('');
}

export function normalizeDisplayTerms(line: unknown): string {
  return transformOutsideInlineCode(String(line ?? ''), (chunk) => chunk
    .replace(/\bauthority_locus\b/g, 'authority locus')
    .replace(/\bauthority_posture\b/g, 'authority posture')
    .replace(/\bfacade_only\b/g, '`facade_only`')
    .replace(/\bnarada_proper\b/g, '`narada_proper`'));
}

export function styleInlineMarkdown(text: unknown, style: TerminalStyleOverrides = createTerminalStyle({ enabled: false })): string {
  const terminalStyle = terminalMarkdownStyle(style);
  return String(text ?? '').split(/(`[^`\r\n]+`)/g)
    .map((part) => {
      if (/^`[^`\r\n]+`$/.test(part)) return terminalStyle.code(part.slice(1, -1));
      return styleInlineBold(part, terminalStyle);
    })
    .join('');
}

export const styleInlineCode = styleInlineMarkdown;

function styleInlineBold(text: unknown, style: TerminalStyle): string {
  const bold = typeof style.bold === 'function' ? style.bold : (value: string): string => value;
  return String(text ?? '').replace(/\*\*([^*\r\n][^\r\n]*?)\*\*/g, (_match: string, value: string) => bold(value));
}

export function renderMarkdownForTerminal(text: unknown, style: TerminalStyleOverrides = createTerminalStyle({ enabled: false })): string {
  const terminalStyle = terminalMarkdownStyle(style);
  const lines = String(text ?? '').split(/\r?\n/);
  let inFence = false;
  let inTable = false;
  let tableHeader: string[] | null = null;
  let tableRows: string[][] = [];
  const outLines: string[] = [];
  const flushTable = (): void => {
    if (!tableHeader) return;
    const colCount = tableHeader.length;
    const widths = tableHeader.map((header, index) => Math.max(
      visibleLength(styleInlineMarkdown(header, terminalStyle)),
      ...tableRows.map((row) => visibleLength(styleInlineMarkdown(row[index] ?? '', terminalStyle))),
    ));
    const renderRow = (row: string[]): string => row
      .map((cell, index) => padVisible(styleInlineMarkdown(cell ?? '', terminalStyle), widths[index]))
      .join('  ');
    outLines.push(terminalStyle.label(renderRow(tableHeader)));
    for (const row of tableRows) {
      const paddedRow: string[] = [];
      for (let index = 0; index < colCount; index++) {
        paddedRow.push(padVisible(styleInlineMarkdown(row[index] ?? '', terminalStyle), widths[index]));
      }
      outLines.push(paddedRow.join('  '));
    }
    tableHeader = null;
    tableRows = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (inTable) {
        flushTable();
        inTable = false;
      }
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      outLines.push(terminalStyle.code(`  ${line.replace(/^\s{0,4}/, '')}`));
      continue;
    }
    const tableMatch = line.match(/^\|(.*)\|$/);
    if (tableMatch) {
      inTable = true;
      const cells = tableMatch[1].split('|').map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
      if (tableHeader === null) tableHeader = cells;
      else tableRows.push(cells);
      continue;
    }
    if (inTable) {
      flushTable();
      inTable = false;
    }
    if (/^#{1,6}\s+/.test(line)) {
      outLines.push(terminalStyle.label(line.replace(/^#{1,6}\s+/, '')));
      continue;
    }
    const normalizedLine = normalizeDisplayTerms(line);
    const bulletLine = /^\s*[-*]\s+/.test(normalizedLine)
      ? normalizedLine.replace(/^(\s*)[-*]\s+/, '$1• ')
      : normalizedLine;
    outLines.push(styleInlineMarkdown(bulletLine, terminalStyle));
  }
  if (inTable) flushTable();
  return outLines.join('\n');
}

export function createMarkdownStreamState(): MarkdownStreamState {
  return {
    inFence: false,
  };
}

export function renderMarkdownStreamChunk(
  text: unknown,
  state: MarkdownStreamState = createMarkdownStreamState(),
  style: TerminalStyleOverrides = createTerminalStyle({ enabled: false }),
): string {
  const terminalStyle = terminalMarkdownStyle(style);
  const streamState = state ?? createMarkdownStreamState();
  const source = String(text ?? '');
  const lines = source.split(/\r?\n/);
  const outLines: string[] = [];
  let openedFenceInChunk = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      streamState.inFence = !streamState.inFence;
      openedFenceInChunk = streamState.inFence;
      continue;
    }
    if (streamState.inFence) {
      if (openedFenceInChunk && line === '' && index === lines.length - 1 && /\r?\n$/.test(source)) continue;
      outLines.push(terminalStyle.code(`  ${line.replace(/^\s{0,4}/, '')}`));
      openedFenceInChunk = false;
      continue;
    }
    const normalizedLine = normalizeDisplayTerms(line);
    const bulletLine = /^\s*[-*]\s+/.test(normalizedLine)
      ? normalizedLine.replace(/^(\s*)[-*]\s+/, '$1• ')
      : normalizedLine;
    outLines.push(styleInlineMarkdown(bulletLine, terminalStyle));
  }
  return outLines.join('\n');
}
