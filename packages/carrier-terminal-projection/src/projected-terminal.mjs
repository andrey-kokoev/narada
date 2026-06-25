import readline from 'node:readline';
import { createTerminalStyle, formatTerminalMessageBlockLines } from './terminal-style.mjs';
import {
  createExplicitJsonControlFrame,
  createOperatorConversationFrame,
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

export function createProjectedOutputWriter({ rl = null, interactive = false, output = process.stdout } = {}) {
  return (text, { preserveCurrentLine = false, prompt = true } = {}) => {
    if (interactive && !preserveCurrentLine) {
      readline.clearLine(output, 0);
      readline.cursorTo(output, 0);
    }
    output.write(text);
    if (interactive && prompt) rl?.prompt(true);
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
  const rl = readline.createInterface({
    input,
    output: interactive ? output : undefined,
    terminal: interactive,
    prompt: interactive ? createOperatorPrompt(style) : undefined,
  });
  const writeProjectedOutput = createProjectedOutputWriter({ rl, interactive, output });
  const operatorState = { streamedTurns: new Set(), style };

  if (interactive) rl.prompt();
  rl.on('line', (line) => {
    const explicitJsonControl = createExplicitJsonControlFrame(line);
    if (explicitJsonControl) {
      if (explicitJsonControl.error) {
        writeProjectedOutput(`agent-cli: ${explicitJsonControl.error}\n`);
      } else {
        rewriteInteractivePrompt({ interactive, output, operatorState, line, style });
        childStdin?.write(`${JSON.stringify(explicitJsonControl.frame)}\n`);
      }
      if (interactive && explicitJsonControl.error) rl.prompt(true);
      return;
    }

    const slashCommand = createProjectedSlashCommandAction(line);
    if (slashCommand) {
      rewriteInteractivePrompt({ interactive, output, operatorState, line, style });
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

    const frame = createOperatorConversationFrame(line);
    if (frame && interactive) {
      rewriteInteractivePrompt({ interactive, output, operatorState, line, style });
      const agentId = projectedAgentId(operatorState);
      output.write(`${assistantEmissionHeader(operatorState, style, agentId)} thinking...\n`);
      operatorState.localThinkingRendered = true;
      operatorState.localThinkingAgentId = agentId;
      markThinkingRendered(operatorState, agentId);
    }
    if (frame) childStdin?.write(`${JSON.stringify(frame)}\n`);
  });
  rl.on('close', () => {
    childStdin?.end();
  });

  return {
    interactive,
    rl,
    operatorState,
    writeProjectedOutput,
    renderEvent: (event) => renderOperatorEvent(event, operatorState),
  };
}

function rewriteInteractivePrompt({ interactive, output, operatorState, line, style }) {
  if (!interactive) return;
  const rewritten = rewriteSubmittedOperatorPromptForTest({
    line,
    agentId: projectedAgentId(operatorState),
    columns: output.columns || 80,
    style,
  });
  if (rewritten) output.write(rewritten);
}
