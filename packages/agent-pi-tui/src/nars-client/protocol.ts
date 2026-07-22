import { randomUUID } from 'node:crypto';
import {
  AGENT_WEB_UI_NARS_METHOD_LIST,
  NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD,
  buildAgentWebUiConversationEnqueueFrame,
  buildAgentWebUiConversationSendFrame,
  buildAgentWebUiConversationSteerFrame,
  buildAgentWebUiEventsReadFrame,
  buildAgentWebUiSubscribeFrame,
} from '@narada2/nars-client-projection-contract';
import type { NarsProtocolFrame, JsonObject } from '../types.js';

export const NARS_CLIENT_METHODS = Object.freeze([...AGENT_WEB_UI_NARS_METHOD_LIST]);
export const NARS_SESSION_METHODS = Object.freeze(NARS_CLIENT_METHODS.filter((method) => method.startsWith('session.')));

export const NARS_METHODS = Object.freeze(new Set<string>(NARS_CLIENT_METHODS));

export type DeliveryMode = 'immediate' | 'admit_after_active_turn';

export interface SubmitFrameOptions {
  id?: string;
  idempotencyKey?: string;
  activeTurnId?: string;
  deliveryMode?: DeliveryMode;
}

export function requestId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function idempotencyKey(prefix = 'agent-pi-tui-input'): string {
  return `${prefix}-${randomUUID()}`;
}

export function buildSubscribeFrame(options: {
  id?: string;
  includeReplay?: boolean;
  pageSize?: number;
  sinceSequence?: number | null;
  subscriptionId?: string;
} = {}): NarsProtocolFrame {
  return buildAgentWebUiSubscribeFrame({
    id: options.id ?? requestId('agent-pi-tui-subscribe'),
    includeReplay: options.includeReplay !== false,
    pageSize: options.pageSize ?? 100,
    sinceSequence: options.sinceSequence ?? undefined,
    subscriptionId: options.subscriptionId,
  }) as NarsProtocolFrame;
}

export function buildReadEventsFrame(options: {
  id?: string;
  limit?: number;
  afterSequence?: number | null;
  view?: 'conversation' | 'operations' | 'diagnostics' | 'raw';
} = {}): NarsProtocolFrame {
  return buildAgentWebUiEventsReadFrame({
    id: options.id ?? requestId('agent-pi-tui-events-read'),
    limit: options.limit ?? 100,
    afterSequence: options.afterSequence ?? undefined,
    view: options.view,
  }) as NarsProtocolFrame;
}

export function buildSubmitFrame(content: string, options: SubmitFrameOptions = {}): NarsProtocolFrame | null {
  const deliveryMode = options.deliveryMode ?? 'immediate';
  const builder = deliveryMode === 'admit_after_active_turn'
    ? buildAgentWebUiConversationSteerFrame
    : buildAgentWebUiConversationSendFrame;
  const frame = deliveryMode === 'admit_after_active_turn'
    ? builder(content, { id: options.id ?? requestId('agent-pi-tui-steer'), activeTurnId: options.activeTurnId })
    : builder(content, { id: options.id ?? requestId('agent-pi-tui-submit') });
  if (!frame) return null;
  const idempotency = options.idempotencyKey ?? idempotencyKey();
  return {
    ...(frame as NarsProtocolFrame),
    params: {
      ...((frame as NarsProtocolFrame).params ?? {}),
      idempotency_key: idempotency,
    },
  };
}

export function buildQueuedSubmitFrame(content: string, options: Omit<SubmitFrameOptions, 'deliveryMode'> = {}): NarsProtocolFrame | null {
  const frame = buildAgentWebUiConversationEnqueueFrame(content, {
    id: options.id ?? requestId('agent-pi-tui-queue'),
    activeTurnId: options.activeTurnId,
  });
  if (!frame) return null;
  const idempotency = options.idempotencyKey ?? idempotencyKey();
  return {
    ...(frame as NarsProtocolFrame),
    params: {
      ...((frame as NarsProtocolFrame).params ?? {}),
      idempotency_key: idempotency,
    },
  };
}

export function buildRuntimeReconfigureFrame(input: {
  provider?: string;
  model?: string;
  thinking?: string;
  id?: string;
}): NarsProtocolFrame | null {
  const id = input.id ?? requestId('agent-pi-tui-intelligence');
  const params: JsonObject = { request_id: id };
  if (input.model) {
    const modelId = input.model.startsWith('model:') ? input.model : `model:${input.model}`;
    params.requested_model = { kind: 'model', id: modelId };
  }
  if (input.thinking) params.requested_options = { thinking: input.thinking };
  // Provider selection is intentionally retained as a legacy visible command
  // so the runtime can reject it explicitly; Pi must not invent a provider
  // route outside the admitted intelligence plan.
  if (input.provider) params.provider = input.provider;
  if (Object.keys(params).length === 1) return null;
  return {
    id,
    method: NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD,
    params,
  } as NarsProtocolFrame;
}

export function buildControlFrame(method: string, params: JsonObject = {}, id = requestId('agent-pi-tui-control')): NarsProtocolFrame {
  if (!NARS_METHODS.has(method)) throw new Error(`nars_method_not_admitted:${method}`);
  return { id, method, params };
}

export function buildHealthFrame(id = requestId('agent-pi-tui-health')): NarsProtocolFrame {
  return buildControlFrame('session.health', {}, id);
}

export function buildRecoveryFrame(id = requestId('agent-pi-tui-recovery')): NarsProtocolFrame {
  return buildControlFrame('session.recovery', {}, id);
}

export function buildCancelFrame(id = requestId('agent-pi-tui-cancel')): NarsProtocolFrame {
  return buildControlFrame('session.cancel', {}, id);
}

export function buildCloseFrame(reason = 'operator_requested', id = requestId('agent-pi-tui-close')): NarsProtocolFrame {
  return buildControlFrame('session.close', { reason }, id);
}

export function isAdmittedProtocolFrame(value: unknown): value is NarsProtocolFrame {
  if (!value || typeof value !== 'object') return false;
  const frame = value as Partial<NarsProtocolFrame>;
  return typeof frame.id === 'string' && typeof frame.method === 'string' && NARS_METHODS.has(frame.method);
}

export function isRuntimeIntelligenceReconfigureFrame(value: unknown): value is NarsProtocolFrame {
  return isAdmittedProtocolFrame(value) && value.method === NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD;
}
