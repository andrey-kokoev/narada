import {
  buildAgentWebUiOperatorInputAction,
  findAgentWebUiCommand,
  isNarsRuntimeServerMethod,
} from '@narada2/nars-client-projection-contract';
import type { NarsProtocolFrame, ProjectionClass } from '../types.js';
import { buildControlFrame, buildRuntimeReconfigureFrame } from '../nars-client/protocol.js';
import { buildInputDeliveryFrame } from './delivery-mode.js';

export type OperatorInputKind = 'empty' | 'conversation' | 'known_slash' | 'unknown_slash' | 'unavailable_shell' | 'raw_protocol';

export type LocalInputAction =
  | { kind: 'help' }
  | { kind: 'clear' }
  | { kind: 'view'; view: ProjectionClass }
  | { kind: 'latest' }
  | { kind: 'theme'; name?: string }
  | { kind: 'validation'; message: string };

export type OperatorInputClassification =
  | { kind: 'empty'; raw: string }
  | { kind: 'conversation'; raw: string; content: string; frame: NarsProtocolFrame; deliveryMode: 'immediate' | 'admit_after_active_turn' }
  | { kind: 'known_slash'; raw: string; command: string; local?: LocalInputAction; frame?: NarsProtocolFrame }
  | { kind: 'unknown_slash'; raw: string; command: string; local: LocalInputAction }
  | { kind: 'unavailable_shell'; raw: string; local: LocalInputAction }
  | { kind: 'raw_protocol'; raw: string; frame: NarsProtocolFrame };

const LOCAL_COMMANDS = new Set(['/help', '/clear', '/latest', '/theme']);
const DIRECT_COMMANDS = new Map([
  ['/status', 'session.health'],
  ['/health', 'session.health'],
  ['/recovery', 'session.recovery'],
  ['/interrupt', 'session.cancel'],
  ['/exit', 'session.close'],
  ['/quit', 'session.close'],
]);
const RUNTIME_COMMANDS = new Set(['/model', '/provider', '/thinking']);

function parseSlash(raw: string): { command: string; value: string } {
  const [head, ...rest] = raw.split(/\s+/);
  return { command: head.toLowerCase(), value: rest.join(' ').trim() };
}

function localAction(command: string, value: string): LocalInputAction | null {
  switch (command) {
    case '/help': return { kind: 'help' };
    case '/clear': return { kind: 'clear' };
    case '/latest': return { kind: 'latest' };
    case '/theme': return { kind: 'theme', ...(value ? { name: value } : {}) };
    case '/view': {
      if (!['conversation', 'operations', 'diagnostics', 'raw'].includes(value)) {
        return { kind: 'validation', message: 'Usage: /view conversation|operations|diagnostics|raw' };
      }
      return { kind: 'view', view: value as ProjectionClass };
    }
    default: return null;
  }
}

function runtimeFrame(command: string, value: string): NarsProtocolFrame | null {
  if (!value) return null;
  const key = command.slice(1) as 'model' | 'provider' | 'thinking';
  return buildRuntimeReconfigureFrame({ [key]: value });
}

export function classifyOperatorInput(rawInput: string, options: {
  activeTurn?: boolean;
  activeTurnId?: string;
  deliveryMode?: 'immediate' | 'admit_after_active_turn' | 'enqueue';
  idempotencyKey?: string;
  allowRawProtocol?: boolean;
} = {}): OperatorInputClassification {
  const raw = String(rawInput ?? '');
  const value = raw.trim();
  if (!value) return { kind: 'empty', raw };
  if (!value.startsWith('/')) {
    if (value.startsWith('!')) {
      return {
        kind: 'unavailable_shell',
        raw,
        local: { kind: 'validation', message: 'Shell escapes are unavailable; request an admitted NARS capability instead.' },
      };
    }
    const sharedAction = buildAgentWebUiOperatorInputAction(value, {
      activeTurn: options.activeTurn === true,
      deliveryMode: options.deliveryMode === 'enqueue' ? 'enqueue' : undefined,
      activeTurnId: options.activeTurnId,
    }) as Record<string, unknown> | null;
    if (!sharedAction || sharedAction.kind !== 'frame') throw new Error('shared_operator_input_classification_failed');
    const delivery = buildInputDeliveryFrame(value, options);
    if (!delivery.frame) throw new Error('operator_input_frame_build_failed');
    return { kind: 'conversation', raw, content: value, frame: delivery.frame, deliveryMode: delivery.deliveryMode };
  }
  const { command, value: argument } = parseSlash(value);
  if (command === '/json' && options.allowRawProtocol) {
    try {
      const frame = JSON.parse(argument) as NarsProtocolFrame;
      if (!frame || typeof frame !== 'object' || typeof frame.id !== 'string' || typeof frame.method !== 'string') {
        throw new Error('raw_protocol_frame_shape_invalid');
      }
      if (!isNarsRuntimeServerMethod(frame.method) && !['session.events.subscribe', 'session.events.read', 'session.submit', 'session.command.execute', 'session.health', 'session.recovery', 'session.cancel', 'session.close'].includes(frame.method)) {
        throw new Error(`nars_method_not_admitted:${frame.method}`);
      }
      return { kind: 'raw_protocol', raw, frame };
    } catch (error) {
      return { kind: 'unknown_slash', raw, command, local: { kind: 'validation', message: `Invalid raw protocol frame: ${error instanceof Error ? error.message : String(error)}` } };
    }
  }
  const local = localAction(command, argument);
  if (local || LOCAL_COMMANDS.has(command) || command === '/view') {
    return local ? { kind: 'known_slash', raw, command, local } : { kind: 'known_slash', raw, command, local: { kind: 'validation', message: `Usage: ${command}` } };
  }
  if (command === '/events') {
    return { kind: 'known_slash', raw, command, frame: buildControlFrame('session.events.subscribe', { include_replay: true, page_size: 100 }) };
  }
  const directMethod = DIRECT_COMMANDS.get(command);
  if (directMethod) {
    return { kind: 'known_slash', raw, command, frame: buildControlFrame(directMethod, command === '/exit' || command === '/quit' ? { reason: 'operator_requested' } : {}) };
  }
  if (RUNTIME_COMMANDS.has(command)) {
    const frame = runtimeFrame(command, argument);
    return frame
      ? { kind: 'known_slash', raw, command, frame }
      : { kind: 'known_slash', raw, command, local: { kind: 'validation', message: `Usage: ${command} <value>` } };
  }
  // Use the shared command registry for aliases and to keep the local command
  // vocabulary discoverable, but never forward an unknown slash to NARS.
  const sharedCommand = findAgentWebUiCommand(command);
  if (sharedCommand && sharedCommand.slash === '/events') {
    return { kind: 'known_slash', raw, command, frame: buildControlFrame('session.events.subscribe', { include_replay: true, page_size: 100 }) };
  }
  return { kind: 'unknown_slash', raw, command, local: { kind: 'validation', message: `Unknown command: ${command}. Type /help.` } };
}
