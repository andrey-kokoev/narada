const TERMINAL_PROTOCOL_COMMANDS = Object.freeze([
  Object.freeze({ primary: '/status', help: 'Show runtime health', method: 'session.health' }),
  Object.freeze({ primary: '/health', help: 'Show runtime health', method: 'session.health' }),
  Object.freeze({ primary: '/events', help: 'Show recent event subscription replay', method: 'session.events.subscribe', params: { include_replay: true, max_replay: 20 } }),
  Object.freeze({ primary: '/recovery', help: 'Show recovery workflow', method: 'session.recovery' }),
  Object.freeze({ primary: '/interrupt', help: 'Cancel the active request', method: 'session.cancel' }),
  Object.freeze({ primary: '/exit', help: 'Close the session', method: 'session.close' }),
]);

const TERMINAL_PROTOCOL_COMMANDS_BY_PRIMARY = new Map(
  TERMINAL_PROTOCOL_COMMANDS.map((command) => [command.primary, command]),
);
const TERMINAL_RAW_JSON_COMMAND = Object.freeze({
  slash: '/json',
  primary: '/json <frame>',
  help: 'Send an explicit session-core control frame',
});
const NARROW_CONTROL_METHODS = new Set([
  'session.submit',
  'session.health',
  'session.cancel',
  'session.recovery',
  'session.close',
  'session.events.subscribe',
]);

export const BRACKETED_PASTE_START = '\x1b[200~';
export const BRACKETED_PASTE_END = '\x1b[201~';

function requestIdForCommand(command) {
  return `operator-command-${command}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function countReadlineSubmissionsForPaste(value) {
  return (String(value ?? '').match(/\r\n|\r|\n/g) ?? []).length;
}

export function createBracketedPasteComposer({ onPaste = () => {}, onSuppressLines = () => {} } = {}) {
  let active = false;
  let buffer = '';
  let pendingMarker = '';

  return {
    feed(chunk) {
      let text = `${pendingMarker}${Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '')}`;
      pendingMarker = '';
      let observedPaste = active;
      while (text) {
        if (!active) {
          const startIndex = text.indexOf(BRACKETED_PASTE_START);
          if (startIndex === -1) {
            const keep = trailingMarkerPrefixLength(text, BRACKETED_PASTE_START);
            pendingMarker = keep ? text.slice(-keep) : '';
            return observedPaste;
          }
          observedPaste = true;
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

function trailingMarkerPrefixLength(text, marker) {
  const value = String(text ?? '');
  for (let length = Math.min(marker.length - 1, value.length); length > 0; length -= 1) {
    if (marker.startsWith(value.slice(-length))) return length;
  }
  return 0;
}

export function createProjectedSlashCommandAction(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('/')) return null;
  const [rawCommand] = trimmed.split(/\s+/);
  const command = rawCommand.toLowerCase();
  if (command === '/help') return { kind: 'local_help' };
  if (command === '/clear') return { kind: 'clear' };
  const protocolCommand = TERMINAL_PROTOCOL_COMMANDS_BY_PRIMARY.get(command);
  if (protocolCommand) {
    return {
      kind: 'frame',
      frame: controlFrame(
        command.slice(1),
        protocolCommand.method,
        protocolCommand.params ?? {},
      ),
    };
  }
  return { kind: 'message', message: `Unknown command: ${command}. Type /help.` };
}

export function projectedHelpText() {
  const local = [
    { primary: '/help', help: 'Show commands' },
    { primary: '/clear', help: 'Clear terminal output' },
  ];
  return [
    'Commands',
    '',
    ...[...local, ...TERMINAL_PROTOCOL_COMMANDS, TERMINAL_RAW_JSON_COMMAND]
      .map((command) => `${command.primary.padEnd(21)} ${command.help}`),
  ].join('\n');
}

export function createOperatorConversationFrame(line) {
  return createSubmitFrame(line, 'operator-submit', {
    source: 'programmatic_operator',
    source_id: 'agent-runtime-server.operator_terminal',
  });
}

export function createOperatorConversationEnqueueFrame(line, options = {}) {
  return createOperatorSteeringFrame(line, options);
}

export function createOperatorSteeringFrame(line, { activeTurnId = null } = {}) {
  return createSubmitFrame(line, 'operator-steer', {
    source: 'operator_steering',
    delivery_mode: 'admit_after_active_turn',
    ...(activeTurnId ? { active_turn_id: activeTurnId } : {}),
  });
}

function createSubmitFrame(line, requestKind, params = {}) {
  const content = String(line ?? '');
  if (!content.trim()) return null;
  const requestId = `${requestKind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id: requestId,
    method: 'session.submit',
    params: {
      request_id: requestId,
      content,
      ...params,
    },
  };
}

export function createExplicitJsonControlFrame(line) {
  const text = String(line ?? '');
  const match = text.match(/^\s*\/json(?:\s+(.+))?$/s);
  if (!match) return null;
  const payload = match[1]?.trim();
  if (!payload) return { error: 'usage: /json <control-frame-json>' };
  try {
    const frame = JSON.parse(payload);
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
      return { error: '/json payload must be a JSON object control frame' };
    }
    if (!NARROW_CONTROL_METHODS.has(frame.method)) {
      return { error: `/json unsupported session-core method: ${String(frame.method ?? '<missing>')}` };
    }
    return { frame };
  } catch (error) {
    return { error: `/json invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function controlFrame(command, method, params = {}) {
  return {
    id: requestIdForCommand(command),
    method,
    params,
  };
}
