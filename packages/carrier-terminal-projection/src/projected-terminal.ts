import readline from 'node:readline';
import { createTerminalStyle, formatTerminalMessageBlockLines } from './terminal-style.js';
import {
  BRACKETED_PASTE_END,
  BRACKETED_PASTE_START,
  createExplicitJsonControlFrame,
  createOperatorConversationFrame,
  createOperatorSteeringFrame,
  createProjectedSlashCommandAction,
  projectedHelpText,
} from './projected-input.js';
import type { ControlFrame, JsonRecord, SubmitFrame } from './projected-input.js';
import {
  assistantEmissionHeader,
  markThinkingRendered,
  projectedAgentId,
  renderOperatorEvent,
} from './terminal-event-rendering.js';
import type {
  TerminalProjectionEvent,
  TerminalProjectionLine,
  TerminalProjectionState,
  TerminalProjectionStyle,
} from './terminal-event-rendering.js';
import {
  clearPreviousTerminalRows,
  formatTimestamp,
  stripAnsi,
  terminalColumns,
  wrapIndentedLines,
  wrapTerminalLine,
} from './terminal-text.js';

interface TerminalInput extends NodeJS.ReadableStream {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => void;
}

interface TerminalOutput extends NodeJS.WritableStream {
  isTTY?: boolean;
  columns?: number;
}

type TerminalChildStdin = NodeJS.WritableStream;

export interface TerminalComposer {
  getDraft(): string;
  getCursor(): number;
  insert(text: unknown): void;
  backspace(): void;
  moveCursorStart(): void;
  moveCursorEnd(): void;
  moveCursorLeft(): void;
  moveCursorRight(): void;
  deleteForward(): void;
  feed(text: unknown): void;
  submit(): void;
  clear(): void;
  render(): void;
}

interface ProjectedOutputWriter {
  (text: string, options?: { preserveCurrentLine?: boolean; prompt?: boolean }): void;
}

interface PromptRenderOptions {
  line?: unknown;
  agentId?: string;
  columns?: number;
  style?: TerminalProjectionStyle;
  now?: Date | string | number;
}

interface RewritePromptOptions extends PromptRenderOptions {}

interface ProjectedOutputWriterOptions {
  composer?: TerminalComposer | null;
  interactive?: boolean;
  output?: TerminalOutput;
}

interface TerminalComposerOptions {
  output: TerminalOutput;
  style: TerminalProjectionStyle;
  columns?: () => number;
  onSubmit?: (line: string) => void;
}

interface BracketedPasteInputFilterOptions {
  onText?: (text: string) => void;
  onPaste?: (text: string) => void;
}

interface ProjectedTerminalBridgeOptions {
  input?: TerminalInput;
  output?: TerminalOutput;
  childStdin?: TerminalChildStdin;
  style?: TerminalProjectionStyle;
}

export interface ProjectedTerminalBridge {
  interactive: boolean;
  rl: readline.Interface | null;
  composer: TerminalComposer | null;
  operatorState: TerminalProjectionState;
  writeProjectedOutput: ProjectedOutputWriter;
  renderEvent: (event: unknown) => TerminalProjectionLine[];
  close: () => void;
}

export {
  createExplicitJsonControlFrame,
  createOperatorConversationFrame,
  createOperatorSteeringFrame,
  createProjectedSlashCommandAction,
} from './projected-input.js';
export { renderOperatorEvent } from './terminal-event-rendering.js';
export {
  normalizeDisplayTerms,
  renderMarkdownForTerminal as renderMarkdownForProjectedTerminal,
  styleInlineMarkdown as styleInlineCode,
  transformOutsideInlineCode,
} from './terminal-markdown.js';

export function colorEnabled({ output = process.stdout, env = process.env }: { output?: TerminalOutput; env?: NodeJS.ProcessEnv } = {}): boolean {
  const setting = String(env.NARADA_AGENT_CLI_COLOR ?? '').trim().toLowerCase();
  if (['0', 'false', 'off', 'no', 'never'].includes(setting)) return false;
  if (['1', 'true', 'on', 'yes', 'always'].includes(setting)) return true;
  return Boolean(output.isTTY && !env.NO_COLOR);
}

export function createOperatorStyle({ enabled = colorEnabled() }: { enabled?: boolean } = {}): TerminalProjectionStyle {
  const style = createTerminalStyle({ enabled });
  return {
    ...style,
    agent: style.label,
    ok: style.success,
  };
}

export function createOperatorPrompt(style: TerminalProjectionStyle = createOperatorStyle({ enabled: false })): string {
  return `${style.operator('operator')} ${style.muted('>')} `;
}

export function rewriteSubmittedOperatorPromptForTest({
  line,
  agentId = 'agent',
  columns = 80,
  style = createOperatorStyle({ enabled: false }),
  now = new Date(),
}: RewritePromptOptions = {}): string | null {
  const text = String(line ?? '');
  if (text.includes('\n') || text.includes('\r')) return null;
  const rawPromptRows = Math.max(1, Math.ceil(stripAnsi(`${createOperatorPrompt(style)}${text}`).length / Math.max(1, columns)));
  const promptLabel = `operator -> ${agentId}`;
  const prefix = `${promptLabel}: `;
  const firstLineWidth = Math.max(16, columns - stripAnsi(prefix).length);
  const lines = wrapTerminalLine(text, firstLineWidth);
  const [first = '', ...rest] = lines;
  const renderedLines = [
    `${style.operator('operator')} ${style.muted('->')} ${style.agent(agentId)}${style.muted(':')} ${first}`,
    ...rest.map((wrapped) => `  ${wrapped}`),
  ];
  appendSuffixToLastLine(renderedLines, ` ${style.timestamp(formatTimestamp(now))}`);
  return `${clearPreviousTerminalRows(rawPromptRows)}\n${renderedLines.join('\n')}\n`;
}

export function createProjectedOutputWriter({ composer = null, interactive = false, output = process.stdout }: ProjectedOutputWriterOptions = {}): ProjectedOutputWriter {
  return (text: string, { preserveCurrentLine = false, prompt = true }: { preserveCurrentLine?: boolean; prompt?: boolean } = {}): void => {
    if (interactive && !preserveCurrentLine) {
      composer?.clear();
    }
    output.write(text);
    if (interactive && prompt) composer?.render();
  };
}

function appendSuffixToLastLine(lines: string[], suffix: string): string[] {
  if (!Array.isArray(lines) || lines.length === 0 || !suffix) return lines;
  lines[lines.length - 1] = `${lines[lines.length - 1]}${suffix}`;
  return lines;
}

export function createProjectedTerminalBridge({
  input = process.stdin,
  output = process.stdout,
  childStdin,
  style = createOperatorStyle({ enabled: colorEnabled({ output }) }),
}: ProjectedTerminalBridgeOptions = {}): ProjectedTerminalBridge {
  const interactive = Boolean(input.isTTY && output.isTTY);
  const operatorState: TerminalProjectionState = { streamedTurns: new Set<string>(), style };
  let rl = null;
  let composer: TerminalComposer | null = null;
  let writeProjectedOutput!: ProjectedOutputWriter;
  const previousRawMode = interactive && typeof input.setRawMode === 'function' ? Boolean(input.isRaw) : null;
  let onInputData: ((chunk: unknown) => void) | null = null;

  const submitOperatorInput = (line: string, { forceConversation = false }: { forceConversation?: boolean } = {}): void => {
    if (!forceConversation) {
      const explicitJsonControl = createExplicitJsonControlFrame(line);
      if (explicitJsonControl) {
        if ('error' in explicitJsonControl) {
          writeProjectedOutput(`agent-cli: ${explicitJsonControl.error}\n`);
        } else {
          if (interactive) writeSubmittedOperatorPrompt({ output, operatorState, line, style });
          childStdin?.write(`${JSON.stringify(explicitJsonControl.frame)}\n`);
        }
        return;
      }

      const slashCommand = createProjectedSlashCommandAction(line);
      if (slashCommand) {
        if (interactive) writeSubmittedOperatorPrompt({ output, operatorState, line, style });
        if (slashCommand.kind === 'frame') {
          childStdin?.write(`${JSON.stringify(slashCommand.frame)}\n`);
        } else if (slashCommand.kind === 'local_help') {
          const rendered = formatTerminalMessageBlockLines({
            label: 'agent-cli',
            lines: wrapIndentedLines(projectedHelpText(), { indent: '', columns: terminalColumns(operatorState) - 2 }),
            style,
            labelStyle: style.label,
          }).join('\n');
          writeProjectedOutput(`${rendered}\n`, { preserveCurrentLine: true });
        } else if (slashCommand.kind === 'clear') {
          output.write('\x1b[2J\x1b[3J\x1b[H');
        } else if (slashCommand.kind === 'message') {
          writeProjectedOutput(`${style.label('agent-cli')}${style.muted(':')} ${slashCommand.message}\n`, { preserveCurrentLine: true });
        }
        return;
      }
    }

    const activeTurnId = typeof operatorState.activeTurnId === 'string' ? operatorState.activeTurnId : null;
    const frame = activeTurnId
      ? createOperatorSteeringFrame(line, { activeTurnId })
      : createOperatorConversationFrame(line);
    if (frame && interactive) {
      writeSubmittedOperatorPrompt({ output, operatorState, line, style });
      const agentId = projectedAgentId(operatorState);
      output.write(`${assistantEmissionHeader(operatorState, style, agentId)} thinking...\n`);
      operatorState.localThinkingRendered = true;
      operatorState.localThinkingAgentId = agentId;
      markThinkingRendered(operatorState, agentId);
    }
    if (frame) childStdin?.write(`${JSON.stringify(frame)}\n`);
  };

  if (interactive) {
    const interactiveComposer = createTerminalComposer({
      output,
      style,
      columns: (): number => output.columns || 80,
      onSubmit: (line: string): void => {
        submitOperatorInput(line, { forceConversation: /\r|\n/.test(String(line ?? '')) });
      },
    });
    composer = interactiveComposer;
    writeProjectedOutput = createProjectedOutputWriter({ composer: interactiveComposer, interactive, output });
    output.write('\x1b[?2004h');
    if (typeof input.setRawMode === 'function') input.setRawMode(true);
    input.resume?.();
    const inputFilter = createBracketedPasteInputFilter({
      onText: (text: string): void => {
        if (isUnframedMultilinePasteBurst(text)) interactiveComposer.insert(normalizeDraftForDisplay(text));
        else interactiveComposer.feed(text);
      },
      onPaste: (text: string): void => {
        interactiveComposer.insert(text);
      },
    });
    onInputData = (chunk: unknown): void => inputFilter.feed(chunk);
    input.on('data', onInputData);
    interactiveComposer.render();
  } else {
    rl = readline.createInterface({ input });
    writeProjectedOutput = createProjectedOutputWriter({ interactive, output });
    rl.on('line', (line: string): void => {
      submitOperatorInput(line, { forceConversation: /\r|\n/.test(String(line ?? '')) });
    });
    rl.on('close', () => {
      childStdin?.end();
    });
  }

  const close = () => {
    if (interactive && onInputData) input.off('data', onInputData);
    if (interactive) {
      input.pause?.();
      composer?.clear();
      output.write('\x1b[?2004l');
    }
    if (interactive && previousRawMode !== null && typeof input.setRawMode === 'function') input.setRawMode(previousRawMode);
    childStdin?.end();
  };

  return {
    interactive,
    rl,
    composer,
    operatorState,
    writeProjectedOutput,
    renderEvent: (event: unknown): TerminalProjectionLine[] => renderOperatorEvent(event, operatorState),
    close,
  };
}

function writeSubmittedOperatorPrompt({ output, operatorState, line, style }: {
  output: TerminalOutput;
  operatorState: TerminalProjectionState;
  line: string;
  style: TerminalProjectionStyle;
}): void {
  const rendered = renderSubmittedOperatorPrompt({
    line,
    agentId: projectedAgentId(operatorState),
    columns: output.columns || 80,
    style,
  });
  if (rendered) output.write(rendered);
}

function renderSubmittedOperatorPrompt({
  line,
  agentId = 'agent',
  columns = 80,
  style = createOperatorStyle({ enabled: false }),
  now = new Date(),
}: PromptRenderOptions = {}): string {
  const text = String(line ?? '');
  if (text.includes('\n') || text.includes('\r')) return '';
  const promptLabel = `operator -> ${agentId}`;
  const prefix = `${promptLabel}: `;
  const firstLineWidth = Math.max(16, columns - stripAnsi(prefix).length);
  const lines = wrapTerminalLine(text, firstLineWidth);
  const [first = '', ...rest] = lines;
  const renderedLines = [
    `${style.operator('operator')} ${style.muted('->')} ${style.agent(agentId)}${style.muted(':')} ${first}`,
    ...rest.map((wrapped) => `  ${wrapped}`),
  ];
  appendSuffixToLastLine(renderedLines, ` ${style.timestamp(formatTimestamp(now))}`);
  return `${renderedLines.join('\n')}\n`;
}

function createTerminalComposer({ output, style, columns = (): number => 80, onSubmit = (_line: string): void => {} }: TerminalComposerOptions): TerminalComposer {
  let draft = '';
  let cursor = 0;
  let renderedRows = 0;
  let pendingEscape = '';

  const api = {
    getDraft() {
      return draft;
    },
    getCursor() {
      return cursor;
    },
    insert(text: unknown): void {
      const value = String(text ?? '');
      if (!value) return;
      draft = `${draft.slice(0, cursor)}${value}${draft.slice(cursor)}`;
      cursor += value.length;
      api.render();
    },
    backspace() {
      if (cursor <= 0) return;
      draft = `${draft.slice(0, cursor - 1)}${draft.slice(cursor)}`;
      cursor -= 1;
      api.render();
    },
    moveCursorStart() {
      if (cursor === 0) return;
      cursor = 0;
      api.render();
    },
    moveCursorEnd() {
      if (cursor === draft.length) return;
      cursor = draft.length;
      api.render();
    },
    moveCursorLeft() {
      if (cursor <= 0) return;
      cursor -= 1;
      api.render();
    },
    moveCursorRight() {
      if (cursor >= draft.length) return;
      cursor += 1;
      api.render();
    },
    deleteForward() {
      if (cursor >= draft.length) return;
      draft = `${draft.slice(0, cursor)}${draft.slice(cursor + 1)}`;
      api.render();
    },
    feed(text: unknown): void {
      const value = String(text ?? '');
      for (const char of value) {
        if (pendingEscape) {
          pendingEscape += char;
          const result = consumeComposerEscapeSequence(pendingEscape, api);
          if (result === 'pending') continue;
          pendingEscape = '';
          if (result === 'handled') continue;
          continue;
        }
        if (char === '\x1b') {
          pendingEscape = char;
          continue;
        }
        if (char === '\r' || char === '\n') {
          api.submit();
          continue;
        }
        if (char === '\x7f' || char === '\b') {
          api.backspace();
          continue;
        }
        if (char >= ' ' || char === '\t') api.insert(char);
      }
    },
    submit(): void {
      const value = draft;
      if (!value.trim()) {
        api.render();
        return;
      }
      api.clear();
      draft = '';
      cursor = 0;
      onSubmit(value);
    },
    clear(): void {
      if (renderedRows <= 0) return;
      output.write(clearRenderedComposerRows(renderedRows));
      renderedRows = 0;
    },
    render(): void {
      api.clear();
      const rendered = renderComposerDraft({ draft, style });
      output.write(rendered);
      renderedRows = composerRenderedRows(rendered, columns());
    },
  };

  return api;
}

function renderComposerDraft({ draft, style }: { draft: string; style: TerminalProjectionStyle }): string {
  const prompt = createOperatorPrompt(style);
  const lines = normalizeDraftForDisplay(draft).split('\n');
  const [first = '', ...rest] = lines;
  return [
    `${prompt}${first}`,
    ...rest.map((line) => `  ${line}`),
  ].join('\n');
}

function consumeComposerEscapeSequence(sequence: string, composer: Pick<TerminalComposer, 'moveCursorStart' | 'moveCursorEnd' | 'moveCursorLeft' | 'moveCursorRight' | 'deleteForward'>): 'pending' | 'handled' | 'ignored' {
  const text = String(sequence ?? '');
  if (text === '\x1b') return 'pending';
  if (!text.startsWith('\x1b[')) return 'ignored';
  if (/^\x1b\[[0-9;]*$/.test(text)) return 'pending';

  const match = text.match(/^\x1b\[([0-9;]*)([~A-Za-z])$/);
  if (!match) return 'ignored';
  const params = match[1] ?? '';
  const final = match[2];
  if (final === 'H' || final === 'F') {
    if (final === 'H') composer.moveCursorStart();
    else composer.moveCursorEnd();
    return 'handled';
  }
  if (final === 'D') {
    composer.moveCursorLeft();
    return 'handled';
  }
  if (final === 'C') {
    composer.moveCursorRight();
    return 'handled';
  }
  if (final === '~') {
    const code = params.split(';')[0];
    if (code === '1' || code === '7') {
      composer.moveCursorStart();
      return 'handled';
    }
    if (code === '4' || code === '8') {
      composer.moveCursorEnd();
      return 'handled';
    }
    if (code === '3') {
      composer.deleteForward();
      return 'handled';
    }
  }
  return 'ignored';
}

function normalizeDraftForDisplay(draft: unknown): string {
  return String(draft ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function isUnframedMultilinePasteBurst(text: unknown): boolean {
  return /(?:\r\n|\r|\n)./s.test(String(text ?? ''));
}

function composerRenderedRows(rendered: unknown, columns: unknown): number {
  const width = Math.max(1, Number(columns) || 80);
  return String(rendered ?? '').split('\n').reduce((count, line) => (
    count + Math.max(1, Math.ceil(stripAnsi(line).length / width))
  ), 0);
}

function clearRenderedComposerRows(rows: unknown): string {
  const count = Math.max(0, Math.floor(Number(rows) || 0));
  if (count <= 0) return '';
  let sequence = '\r\x1b[2K';
  for (let index = 1; index < count; index += 1) {
    sequence += '\x1b[1A\r\x1b[2K';
  }
  return sequence;
}

function createBracketedPasteInputFilter({ onText = (_text: string): void => {}, onPaste = (_text: string): void => {} }: BracketedPasteInputFilterOptions = {}): { feed: (chunk: unknown) => void } {
  let active = false;
  let buffer = '';
  let pendingMarker = '';

  return {
    feed(chunk: unknown): void {
      let text = `${pendingMarker}${Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '')}`;
      pendingMarker = '';
      while (text) {
        if (!active) {
          const startIndex = text.indexOf(BRACKETED_PASTE_START);
          if (startIndex === -1) {
            const keep = trailingMarkerPrefixLength(text, BRACKETED_PASTE_START);
            const body = keep ? text.slice(0, -keep) : text;
            if (body) onText(body);
            pendingMarker = keep ? text.slice(-keep) : '';
            return;
          }
          if (startIndex > 0) onText(text.slice(0, startIndex));
          active = true;
          buffer = '';
          text = text.slice(startIndex + BRACKETED_PASTE_START.length);
          continue;
        }

        const endIndex = text.indexOf(BRACKETED_PASTE_END);
        if (endIndex === -1) {
          const keep = trailingMarkerPrefixLength(text, BRACKETED_PASTE_END);
          buffer += keep ? text.slice(0, -keep) : text;
          pendingMarker = keep ? text.slice(-keep) : '';
          return;
        }

        buffer += text.slice(0, endIndex);
        onPaste(buffer);
        buffer = '';
        active = false;
        text = text.slice(endIndex + BRACKETED_PASTE_END.length);
      }
    },
  };
}

function trailingMarkerPrefixLength(text: unknown, marker: string): number {
  const value = String(text ?? '');
  for (let length = Math.min(marker.length - 1, value.length); length > 0; length -= 1) {
    if (marker.startsWith(value.slice(-length))) return length;
  }
  return 0;
}

export const bracketedPasteControlSequences = {
  start: BRACKETED_PASTE_START,
  end: BRACKETED_PASTE_END,
};
