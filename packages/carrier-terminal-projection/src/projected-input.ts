import { commandRecords, resolveCommandInput } from '@narada2/carrier-command-contract';
import type { CarrierCommand, ResolvedCarrierCommand } from '@narada2/carrier-command-contract';

export type JsonRecord = Record<string, unknown>;

interface TerminalProtocolCommand {
  primary: string;
  help: string;
  method: string;
  params?: JsonRecord;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ControlFrame {
  id: string;
  method: string;
  params: JsonRecord;
}

interface BracketedPasteComposerOptions {
  onPaste?: (text: string) => void;
  onSuppressLines?: (count: number) => void;
}

export interface BracketedPasteComposer {
  feed(chunk: unknown): boolean;
  isActive(): boolean;
}

export type ProjectedSlashCommandAction =
  | { kind: 'frame'; frame: ControlFrame }
  | { kind: 'local_help' }
  | { kind: 'clear' }
  | { kind: 'message'; message: string };

export interface SubmitFrame extends ControlFrame {
  params: JsonRecord & { request_id: string; content: string };
}

const TERMINAL_PROTOCOL_COMMANDS: readonly TerminalProtocolCommand[] = Object.freeze([
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
  'session.command.execute',
  'session.health',
  'session.cancel',
  'session.recovery',
  'session.close',
  'session.events.subscribe',
]);

export const BRACKETED_PASTE_START = '\x1b[200~';
export const BRACKETED_PASTE_END = '\x1b[201~';

function requestIdForCommand(command: string): string {
  return `operator-command-${command}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function countReadlineSubmissionsForPaste(value: unknown): number {
  return (String(value ?? '').match(/\r\n|\r|\n/g) ?? []).length;
}

export function createBracketedPasteComposer({
  onPaste = (_text: string): void => {},
  onSuppressLines = (_count: number): void => {},
}: BracketedPasteComposerOptions = {}): BracketedPasteComposer {
  let active = false;
  let buffer = '';
  let pendingMarker = '';

  return {
    feed(chunk: unknown): boolean {
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

function trailingMarkerPrefixLength(text: unknown, marker: string): number {
  const value = String(text ?? '');
  for (let length = Math.min(marker.length - 1, value.length); length > 0; length -= 1) {
    if (marker.startsWith(value.slice(-length))) return length;
  }
  return 0;
}

export function createProjectedSlashCommandAction(line: unknown): ProjectedSlashCommandAction | null {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === '/exit' || lower === '/quit' || lower === 'exit') {
    return {
      kind: 'frame',
      frame: controlFrame('exit', 'session.close', {}),
    };
  }
  if (!trimmed.startsWith('/')) return null;
  const [rawCommand = ''] = trimmed.split(/\s+/);
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
  const value = trimmed.slice(rawCommand.length).trim();
  const carrierCommand = resolveCommandInput(rawCommand, value);
  if (carrierCommand && !['help', 'clear', 'exit'].includes(carrierCommand.name)) {
    return {
      kind: 'frame',
      frame: controlFrame(carrierCommand.name, 'session.command.execute', {
        command: carrierCommand.primary,
        value: carrierCommand.argument ?? '',
      }),
    };
  }
  return { kind: 'message', message: `Unknown command: ${command}. Type /help.` };
}

export function projectedHelpText(): string {
  const local = [
    { primary: '/help', help: 'Show commands' },
    { primary: '/clear', help: 'Clear terminal output' },
  ];
  return [
    'Commands',
    '',
    ...[
      ...local,
      ...TERMINAL_PROTOCOL_COMMANDS,
      ...commandRecords()
        .filter((command) => !['help', 'clear', 'exit'].includes(command.name))
        .map((command) => ({
          primary: [command.primary, ...(command.aliases ?? [])].join(', '),
          help: command.help,
        })),
      TERMINAL_RAW_JSON_COMMAND,
    ]
      .map((command) => `${command.primary.padEnd(21)} ${command.help}`),
  ].join('\n');
}

export function createOperatorConversationFrame(line: unknown): SubmitFrame | null {
  return createSubmitFrame(line, 'operator-submit', {
    source: 'programmatic_operator',
    source_id: 'agent-runtime-server.operator_terminal',
  });
}

export function createOperatorConversationEnqueueFrame(line: unknown, options: { activeTurnId?: string | null } = {}): SubmitFrame | null {
  return createOperatorSteeringFrame(line, options);
}

export function createOperatorSteeringFrame(line: unknown, { activeTurnId = null }: { activeTurnId?: string | null } = {}): SubmitFrame | null {
  return createSubmitFrame(line, 'operator-steer', {
    source: 'operator_steering',
    delivery_mode: 'admit_after_active_turn',
    ...(activeTurnId ? { active_turn_id: activeTurnId } : {}),
  });
}

function createSubmitFrame(line: unknown, requestKind: string, params: JsonRecord = {}): SubmitFrame | null {
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

export function createExplicitJsonControlFrame(line: unknown): { error: string } | { frame: JsonRecord } | null {
  const text = String(line ?? '');
  const match = text.match(/^\s*\/json(?:\s+(.+))?$/s);
  if (!match) return null;
  const payload = match[1]?.trim();
  if (!payload) return { error: 'usage: /json <control-frame-json>' };
  try {
    const frame: unknown = JSON.parse(payload);
    if (!isRecord(frame)) {
      return { error: '/json payload must be a JSON object control frame' };
    }
    if (typeof frame.method !== 'string' || !NARROW_CONTROL_METHODS.has(frame.method)) {
      return { error: `/json unsupported session-core method: ${String(frame.method ?? '<missing>')}` };
    }
    return { frame };
  } catch (error) {
    return { error: `/json invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function controlFrame(command: string, method: string, params: JsonRecord = {}): ControlFrame {
  return {
    id: requestIdForCommand(command),
    method,
    params,
  };
}
