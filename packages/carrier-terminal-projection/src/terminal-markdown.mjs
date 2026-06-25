import { createTerminalStyle } from './terminal-style.mjs';
import { padVisible, visibleLength } from './terminal-text.mjs';

function terminalMarkdownStyle(style) {
  return {
    ...createTerminalStyle({ enabled: false }),
    ...(style ?? {}),
  };
}

export function transformOutsideInlineCode(text, transform) {
  return String(text ?? '').split(/(`[^`]*`)/g)
    .map((part) => part.startsWith('`') && part.endsWith('`') ? part : transform(part))
    .join('');
}

export function normalizeDisplayTerms(line) {
  return transformOutsideInlineCode(String(line ?? ''), (chunk) => chunk
    .replace(/\bauthority_locus\b/g, 'authority locus')
    .replace(/\bauthority_posture\b/g, 'authority posture')
    .replace(/\bfacade_only\b/g, '`facade_only`')
    .replace(/\bnarada_proper\b/g, '`narada_proper`'));
}

export function styleInlineMarkdown(text, style = createTerminalStyle({ enabled: false })) {
  const terminalStyle = terminalMarkdownStyle(style);
  return String(text ?? '').split(/(`[^`\r\n]+`)/g)
    .map((part) => {
      if (/^`[^`\r\n]+`$/.test(part)) return terminalStyle.code(part.slice(1, -1));
      return styleInlineBold(part, terminalStyle);
    })
    .join('');
}

export const styleInlineCode = styleInlineMarkdown;

function styleInlineBold(text, style) {
  const bold = typeof style.bold === 'function' ? style.bold : (value) => value;
  return String(text ?? '').replace(/\*\*([^*\r\n][^\r\n]*?)\*\*/g, (_match, value) => bold(value));
}

export function renderMarkdownForTerminal(text, style = createTerminalStyle({ enabled: false })) {
  const terminalStyle = terminalMarkdownStyle(style);
  const lines = String(text ?? '').split(/\r?\n/);
  let inFence = false;
  let inTable = false;
  let tableHeader = null;
  let tableRows = [];
  const outLines = [];
  const flushTable = () => {
    if (!tableHeader) return;
    const colCount = tableHeader.length;
    const widths = tableHeader.map((header, index) => Math.max(
      visibleLength(styleInlineMarkdown(header, terminalStyle)),
      ...tableRows.map((row) => visibleLength(styleInlineMarkdown(row[index] ?? '', terminalStyle))),
    ));
    const renderRow = (row) => row
      .map((cell, index) => padVisible(styleInlineMarkdown(cell ?? '', terminalStyle), widths[index]))
      .join('  ');
    outLines.push(terminalStyle.label(renderRow(tableHeader)));
    for (const row of tableRows) {
      const paddedRow = [];
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

export function createMarkdownStreamState() {
  return {
    inFence: false,
  };
}

export function renderMarkdownStreamChunk(text, state = createMarkdownStreamState(), style = createTerminalStyle({ enabled: false })) {
  const terminalStyle = terminalMarkdownStyle(style);
  const streamState = state ?? createMarkdownStreamState();
  const source = String(text ?? '');
  const lines = source.split(/\r?\n/);
  const outLines = [];
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
