import { commandRecords, resolveCommandInput } from '@narada2/carrier-command-contract';
import { classifyCarrierControlRequest } from '@narada2/carrier-protocol';

function shellLikeWords(value) {
  const words = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(String(value ?? ''))) !== null) {
    words.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return words;
}

function normalizeSessionSyncDirection(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['upload', 'download', 'bidirectional'].includes(normalized) ? normalized : 'upload';
}

function requestIdForCommand(command) {
  return `operator-command-${command}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function opsSyncFrame(value = '') {
  const tokens = shellLikeWords(value);
  if (tokens[0]?.toLowerCase() !== 'sync') return null;
  const params = {
    target: null,
    direction: 'upload',
    dry_run: false,
    delete: false,
  };
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index].toLowerCase();
    const next = tokens[index + 1];
    if (token === '--target' && next) {
      params.target = next;
      index += 1;
      continue;
    }
    if (token === '--direction' && next) {
      params.direction = normalizeSessionSyncDirection(next);
      index += 1;
      continue;
    }
    if (token === '--dry-run') {
      params.dry_run = true;
      continue;
    }
    if (token === '--delete') {
      params.delete = true;
      continue;
    }
    if (token !== '--json' && !params.target) params.target = tokens[index];
  }
  params.target = String(params.target ?? '').trim() || null;
  return { id: requestIdForCommand('ops-sync'), method: 'session.sync', params };
}

function commandFrame(command, value = '') {
  return {
    id: requestIdForCommand(command.replace(/^\//, '').replace(/[^a-z0-9]+/g, '-')),
    method: 'session.command.execute',
    params: { command, value },
  };
}

const TERMINAL_LOCAL_COMMAND_NAMES = new Set(['help', 'clear']);
const TERMINAL_CONTRACT_DIRECT_COMMANDS = new Set(['status', 'observers', 'observer_mute', 'observer_unmute', 'exit']);
const TERMINAL_SESSION_COMMAND_NAMES = new Set(commandRecords()
  .filter((command) => !TERMINAL_LOCAL_COMMAND_NAMES.has(command.name) && !TERMINAL_CONTRACT_DIRECT_COMMANDS.has(command.name))
  .map((command) => command.name));

const TERMINAL_PROTOCOL_COMMANDS = Object.freeze([
  Object.freeze({ primary: '/health', help: 'Show runtime health', buildFrame: () => ({ id: requestIdForCommand('health'), method: 'session.health', params: {} }) }),
  Object.freeze({ primary: '/events', help: 'Show recent event subscription replay', buildFrame: () => ({ id: requestIdForCommand('events'), method: 'session.events.subscribe', params: { include_replay: true, max_replay: 20 } }) }),
  Object.freeze({ primary: '/recovery', help: 'Show recovery workflow', buildFrame: () => ({ id: requestIdForCommand('recovery'), method: 'session.recovery', params: {} }) }),
  Object.freeze({ primary: '/ops', help: 'Show operation workflow summary', buildFrame: (value) => opsSyncFrame(value) ?? { id: requestIdForCommand('ops'), method: 'session.operations', params: {} } }),
  Object.freeze({ primary: '/interrupt', help: 'Interrupt active response', buildFrame: () => ({ id: requestIdForCommand('interrupt'), method: 'conversation.interrupt', params: {} }) }),
]);

const TERMINAL_PROTOCOL_COMMANDS_BY_PRIMARY = new Map(TERMINAL_PROTOCOL_COMMANDS.map((command) => [command.primary, command]));
const TERMINAL_RAW_JSON_COMMAND = Object.freeze({ slash: '/json', primary: '/json <frame>', help: 'Send explicit JSONL control frame' });

export const BRACKETED_PASTE_START = '\x1b[200~';
export const BRACKETED_PASTE_END = '\x1b[201~';

export function countReadlineSubmissionsForPaste(value) {
  return (String(value ?? '').match(/\r\n|\r|\n/g) ?? []).length;
}

export function createBracketedPasteComposer({ onPaste = () => {}, onSuppressLines = () => {} } = {}) {
  let active = false;
  let buffer = '';

  return {
    feed(chunk) {
      let text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '');
      let observedPaste = false;
      while (text) {
        if (!active) {
          const startIndex = text.indexOf(BRACKETED_PASTE_START);
          if (startIndex === -1) return observedPaste;
          observedPaste = true;
          active = true;
          buffer = '';
          text = text.slice(startIndex + BRACKETED_PASTE_START.length);
          continue;
        }

        const endIndex = text.indexOf(BRACKETED_PASTE_END);
        if (endIndex === -1) {
          buffer += text;
          return true;
        }

        buffer += text.slice(0, endIndex);
        const pastedText = buffer;
        buffer = '';
        active = false;
        onSuppressLines(countReadlineSubmissionsForPaste(pastedText));
        onPaste(pastedText);
        text = text.slice(endIndex + BRACKETED_PASTE_END.length);
      }
      return observedPaste;
    },
    isActive() {
      return active;
    },
  };
}

export function createProjectedSlashCommandAction(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return null;
  const resolvedCommand = resolveCommandInput(trimmed, '');
  if (resolvedCommand?.name === 'exit') {
    return { kind: 'frame', frame: { id: requestIdForCommand('exit'), method: 'session.close', params: {} } };
  }
  if (!trimmed.startsWith('/')) return null;
  const [rawCommand, ...rest] = trimmed.split(/\s+/);
  const command = rawCommand.toLowerCase();
  const value = rest.join(' ').trim();
  if (resolvedCommand?.name === 'help') return { kind: 'local_help' };
  if (resolvedCommand?.name === 'clear') return { kind: 'clear' };
  if (resolvedCommand?.name === 'status') return { kind: 'frame', frame: { id: requestIdForCommand('status'), method: 'session.status', params: {} } };
  const protocolCommand = TERMINAL_PROTOCOL_COMMANDS_BY_PRIMARY.get(command);
  if (protocolCommand) return { kind: 'frame', frame: protocolCommand.buildFrame(value) };
  if (resolvedCommand?.name === 'observers') return { kind: 'frame', frame: { id: requestIdForCommand('observers'), method: 'observers.status', params: {} } };
  if (resolvedCommand?.name === 'observer_mute') return { kind: 'frame', frame: { id: requestIdForCommand('observer-mute'), method: 'observer.mute', params: {} } };
  if (resolvedCommand?.name === 'observer_unmute') return { kind: 'frame', frame: { id: requestIdForCommand('observer-unmute'), method: 'observer.unmute', params: {} } };
  if (resolvedCommand && TERMINAL_SESSION_COMMAND_NAMES.has(resolvedCommand.name)) {
    return { kind: 'frame', frame: commandFrame(command, value) };
  }
  if (command === '/observer') return { kind: 'message', message: 'Usage: /observer mute|unmute' };
  return { kind: 'message', message: `Unknown command: ${command}. Type /help.` };
}

export function projectedHelpText() {
  const rows = commandRecords().map((command) => `${command.primary.padEnd(21)} ${command.help}`);
  const protocolRows = TERMINAL_PROTOCOL_COMMANDS.map((command) => `${command.primary.padEnd(21)} ${command.help}`);
  return ['Commands', '', ...rows, ...protocolRows, `${TERMINAL_RAW_JSON_COMMAND.primary.padEnd(21)} ${TERMINAL_RAW_JSON_COMMAND.help}`].join('\n');
}

export function createOperatorConversationFrame(line) {
  const rawMessage = String(line ?? '');
  if (!rawMessage.trim()) return null;
  const requestId = `operator-conversation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id: requestId,
    method: 'conversation.send',
    params: {
      request_id: requestId,
      message: rawMessage,
      source: 'programmatic_operator',
      source_id: 'agent-runtime-server.operator_terminal',
    },
  };
}

export function createOperatorConversationEnqueueFrame(line) {
  const rawMessage = String(line ?? '');
  if (!rawMessage.trim()) return null;
  const requestId = `operator-conversation-enqueue-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id: requestId,
    method: 'conversation.enqueue',
    params: {
      request_id: requestId,
      message: rawMessage,
      source: 'programmatic_operator',
      source_id: 'agent-runtime-server.operator_terminal',
    },
  };
}

export function createOperatorSteeringFrame(line) {
  const rawMessage = String(line ?? '');
  if (!rawMessage.trim()) return null;
  const requestId = `operator-steering-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id: requestId,
    method: 'conversation.steer',
    params: {
      request_id: requestId,
      message: rawMessage,
      source: 'programmatic_operator',
      source_id: 'agent-runtime-server.operator_terminal',
    },
  };
}

export function createExplicitJsonControlFrame(line) {
  const text = String(line ?? '');
  const match = text.match(new RegExp(`^\\s*${TERMINAL_RAW_JSON_COMMAND.slash.replace('/', '\\/')}(?:\\s+(.+))?$`, 's'));
  if (!match) return null;
  const payload = match[1]?.trim();
  if (!payload) return { error: 'usage: /json <control-frame-json>' };
  try {
    const frame = JSON.parse(payload);
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
      return { error: '/json payload must be a JSON object control frame' };
    }
    const admission = classifyCarrierControlRequest(frame);
    if (admission.error) return { error: `/json ${admission.error.message}` };
    return { frame };
  } catch (error) {
    return { error: `/json invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}
