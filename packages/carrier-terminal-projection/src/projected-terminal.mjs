import readline from 'node:readline';
import { createTerminalStyle, formatTerminalMessageBlockLines } from './terminal-style.mjs';
import {
  BRACKETED_PASTE_END,
  BRACKETED_PASTE_START,
  createExplicitJsonControlFrame,
  createOperatorConversationFrame,
  createOperatorSteeringFrame,
  createProjectedSlashCommandAction,
  projectedHelpText,
} from './projected-input.mjs';
import {
  assistantEmissionHeader,
  markThinkingRendered,
  projectedAgentId,
  renderOperatorEvent,
} from './terminal-event-rendering.mjs';
import {
  clearPreviousTerminalRows,
  formatTimestamp,
  stripAnsi,
  terminalColumns,
  wrapIndentedLines,
  wrapTerminalLine,
} from './terminal-text.mjs';

export {
  createExplicitJsonControlFrame,
  createOperatorConversationFrame,
  createOperatorSteeringFrame,
  createProjectedSlashCommandAction,
} from './projected-input.mjs';
export { renderOperatorEvent } from './terminal-event-rendering.mjs';
export {
  normalizeDisplayTerms,
  renderMarkdownForTerminal as renderMarkdownForProjectedTerminal,
  styleInlineMarkdown as styleInlineCode,
  transformOutsideInlineCode,
} from './terminal-markdown.mjs';

export function colorEnabled({ output = process.stdout, env = process.env } = {}) {
  const setting = String(env.NARADA_AGENT_CLI_COLOR ?? '').trim().toLowerCase();
  if (['0', 'false', 'off', 'no', 'never'].includes(setting)) return false;
  if (['1', 'true', 'on', 'yes', 'always'].includes(setting)) return true;
  return Boolean(output.isTTY && !env.NO_COLOR);
}

export function createOperatorStyle({ enabled = colorEnabled() } = {}) {
  const style = createTerminalStyle({ enabled });
  return {
    ...style,
    agent: style.label,
    ok: style.success,
  };
}

export function createOperatorPrompt(style = createOperatorStyle({ enabled: false })) {
  return `${style.operator('operator')} ${style.muted('>')} `;
}

export function rewriteSubmittedOperatorPromptForTest({
  line,
  agentId = 'agent',
  columns = 80,
  style = createOperatorStyle({ enabled: false }),
  now = new Date(),
} = {}) {
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

export function createProjectedOutputWriter({ composer = null, interactive = false, output = process.stdout } = {}) {
  return (text, { preserveCurrentLine = false, prompt = true } = {}) => {
    if (interactive && !preserveCurrentLine) {
      composer?.clear();
    }
    output.write(text);
    if (interactive && prompt) composer?.render();
  };
}

function appendSuffixToLastLine(lines, suffix) {
  if (!Array.isArray(lines) || lines.length === 0 || !suffix) return lines;
  lines[lines.length - 1] = `${lines[lines.length - 1]}${suffix}`;
  return lines;
}

export function createProjectedTerminalBridge({
  input = process.stdin,
  output = process.stdout,
  childStdin,
  style = createOperatorStyle({ enabled: colorEnabled({ output }) }),
} = {}) {
  const interactive = Boolean(input.isTTY && output.isTTY);
  const operatorState = { streamedTurns: new Set(), style };
  let rl = null;
  let composer = null;
  let writeProjectedOutput = null;
  const previousRawMode = interactive && typeof input.setRawMode === 'function' ? Boolean(input.isRaw) : null;
  let onInputData = null;

  const submitOperatorInput = (line, { forceConversation = false } = {}) => {
    if (!forceConversation) {
      const explicitJsonControl = createExplicitJsonControlFrame(line);
      if (explicitJsonControl) {
        if (explicitJsonControl.error) {
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

    const frame = operatorState.activeTurnId
      ? createOperatorSteeringFrame(line)
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
    composer = createTerminalComposer({
      output,
      style,
      columns: () => output.columns || 80,
      onSubmit: (line) => {
        submitOperatorInput(line, { forceConversation: /\r|\n/.test(String(line ?? '')) });
      },
    });
    writeProjectedOutput = createProjectedOutputWriter({ composer, interactive, output });
    output.write('\x1b[?2004h');
    if (typeof input.setRawMode === 'function') input.setRawMode(true);
    input.resume?.();
    const inputFilter = createBracketedPasteInputFilter({
      onText: (text) => {
        composer.feed(text);
      },
      onPaste: (text) => {
        composer.insert(text);
      },
    });
    onInputData = (chunk) => inputFilter.feed(chunk);
    input.on('data', onInputData);
    composer.render();
  } else {
    rl = readline.createInterface({ input });
    writeProjectedOutput = createProjectedOutputWriter({ interactive, output });
    rl.on('line', (line) => {
      submitOperatorInput(line, { forceConversation: /\r|\n/.test(String(line ?? '')) });
    });
    rl.on('close', () => {
      childStdin?.end();
    });
  }

  const close = () => {
    if (interactive && onInputData) input.off('data', onInputData);
    if (interactive) {
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
    renderEvent: (event) => renderOperatorEvent(event, operatorState),
    close,
  };
}

function writeSubmittedOperatorPrompt({ output, operatorState, line, style }) {
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
} = {}) {
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

function createTerminalComposer({ output, style, columns = () => 80, onSubmit = () => {} } = {}) {
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
    insert(text) {
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
    feed(text) {
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
    submit() {
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
    clear() {
      if (renderedRows <= 0) return;
      output.write(clearRenderedComposerRows(renderedRows));
      renderedRows = 0;
    },
    render() {
      api.clear();
      const rendered = renderComposerDraft({ draft, style });
      output.write(rendered);
      renderedRows = composerRenderedRows(rendered, columns());
    },
  };

  return api;
}

function renderComposerDraft({ draft, style }) {
  const prompt = createOperatorPrompt(style);
  const lines = normalizeDraftForDisplay(draft).split('\n');
  const [first = '', ...rest] = lines;
  return [
    `${prompt}${first}`,
    ...rest.map((line) => `  ${line}`),
  ].join('\n');
}

function consumeComposerEscapeSequence(sequence, composer) {
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

function normalizeDraftForDisplay(draft) {
  return String(draft ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function composerRenderedRows(rendered, columns) {
  const width = Math.max(1, Number(columns) || 80);
  return String(rendered ?? '').split('\n').reduce((count, line) => (
    count + Math.max(1, Math.ceil(stripAnsi(line).length / width))
  ), 0);
}

function clearRenderedComposerRows(rows) {
  const count = Math.max(0, Math.floor(Number(rows) || 0));
  if (count <= 0) return '';
  let sequence = '\r\x1b[2K';
  for (let index = 1; index < count; index += 1) {
    sequence += '\x1b[1A\r\x1b[2K';
  }
  return sequence;
}

function createBracketedPasteInputFilter({ onText = () => {}, onPaste = () => {} } = {}) {
  let active = false;
  let buffer = '';

  return {
    feed(chunk) {
      let text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '');
      while (text) {
        if (!active) {
          const startIndex = text.indexOf(BRACKETED_PASTE_START);
          if (startIndex === -1) {
            onText(text);
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
          buffer += text;
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

export const bracketedPasteControlSequences = {
  start: BRACKETED_PASTE_START,
  end: BRACKETED_PASTE_END,
};
