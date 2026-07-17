import type { NarsTransportLifecycle } from './sessionTransportAdapters';

export interface SessionProtocolFrame {
  id?: string;
  method: string;
  params?: Record<string, unknown>;
}

export { toSessionProtocolFrame } from './session-frame.js';

export function isProjectionInputAdmissionAccepted(event: Record<string, unknown>): boolean {
  const status = typeof event.status === 'string' ? event.status.trim().toLowerCase() : '';
  if (!status) return event.http_ok === true;
  return ['ok', 'accepted', 'admitted', 'admitted_to_turn', 'queued'].includes(status);
}

export type SessionTransportKind = 'local-websocket' | 'cloudflare-projection';

export interface SessionTransportCorrelation {
  transport: SessionTransportKind;
  endpoint: string | null;
  session_id: string | null;
  socket_generation: number;
}

export function sessionIdFromTransportMessage(message: unknown): string | null {
  const queue: unknown[] = [message];
  const visited = new Set<object>();
  while (queue.length > 0) {
    const value = queue.shift();
    if (!value || typeof value !== 'object') continue;
    if (visited.has(value)) continue;
    visited.add(value);
    const candidate = value as Record<string, unknown>;
    for (const key of ['session_id', 'runtime_session_id', 'carrier_session_id']) {
      const id = candidate[key];
      if (typeof id === 'string' && id.trim()) return id.trim();
    }
    for (const key of ['payload', 'data', 'result', 'event']) {
      if (candidate[key] && typeof candidate[key] === 'object') queue.push(candidate[key]);
    }
  }
  return null;
}

export interface SessionTransport {
  readonly lifecycle: Readonly<NarsTransportLifecycle>;
  readonly activeTurnId: string | boolean | null;
  readonly lastSequence: number | null;
  readonly kind: SessionTransportKind;
  readonly healthEndpoint: string | null;
  readonly transportCorrelation: Readonly<SessionTransportCorrelation>;
  getSocket(): WebSocket | null;
  requestHealth(fetchFn?: typeof fetch): Promise<Response> | null;
  sendFrame(frame: SessionProtocolFrame): boolean;
  clearPendingOperatorInput(requestId: string | null | undefined): void;
  reviewPendingOperatorInput(requestId: string | null | undefined): boolean;
  discardPendingOperatorInput(requestId: string | null | undefined): boolean;
  markPendingOperatorInputRetried(requestId: string | null | undefined, retryRequestId?: string | null): boolean;
  subscribeView(view: string): boolean;
  readEventsPage(options: { view?: string; beforeSequence?: number; afterSequence?: number; direction?: 'forward' | 'backward'; limit?: number }): boolean;
  close(): void;
}
