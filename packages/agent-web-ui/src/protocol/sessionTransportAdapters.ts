import type { NarsClientConnection, NarsClientOptions } from './narsClient';

export type NarsTransportPhase = 'unconfigured' | 'idle' | 'opening' | 'replaying' | 'live' | 'reconnecting' | 'closing' | 'closed';

export interface NarsTransportLifecycle {
  phase: NarsTransportPhase;
  attempt: number;
  reason: string | null;
  disconnectedAt: number | null;
}

export type NarsTransportEvent =
  | { type: 'open_requested' }
  | { type: 'replay_started' }
  | { type: 'connected' }
  | { type: 'reconnect_scheduled'; reason: string; at?: number }
  | { type: 'close_requested' }
  | { type: 'closed' };

export const NARS_TRANSPORT_TRANSITIONS: Readonly<
  Record<NarsTransportPhase, readonly NarsTransportEvent['type'][]>
> = Object.freeze({
  unconfigured: ['close_requested', 'closed'],
  idle: ['reconnect_scheduled', 'close_requested', 'closed', 'open_requested'],
  opening: ['replay_started', 'connected', 'reconnect_scheduled', 'close_requested', 'closed'],
  replaying: ['connected', 'reconnect_scheduled', 'close_requested', 'closed'],
  live: ['reconnect_scheduled', 'close_requested', 'closed'],
  reconnecting: ['open_requested', 'reconnect_scheduled', 'close_requested', 'closed'],
  closing: ['closed'],
  closed: [],
});

export function canTransitionNarsTransport(
  phase: NarsTransportPhase,
  eventType: NarsTransportEvent['type'],
): boolean {
  return NARS_TRANSPORT_TRANSITIONS[phase].includes(eventType);
}

export function createNarsTransportLifecycle(configured: boolean): NarsTransportLifecycle {
  return {
    phase: configured ? 'idle' : 'unconfigured',
    attempt: 0,
    reason: null,
    disconnectedAt: null,
  };
}

export function transitionNarsTransport(lifecycle: NarsTransportLifecycle, event: NarsTransportEvent): void {
  if (!canTransitionNarsTransport(lifecycle.phase, event.type)) return;

  switch (event.type) {
    case 'open_requested':
      lifecycle.phase = 'opening';
      lifecycle.reason = null;
      return;
    case 'replay_started':
      lifecycle.phase = 'replaying';
      return;
    case 'connected':
      lifecycle.phase = 'live';
      lifecycle.attempt = 0;
      lifecycle.reason = null;
      lifecycle.disconnectedAt = null;
      return;
    case 'reconnect_scheduled':
      lifecycle.phase = 'reconnecting';
      lifecycle.attempt += 1;
      lifecycle.reason = event.reason;
      lifecycle.disconnectedAt ??= event.at ?? Date.now();
      return;
    case 'close_requested':
      lifecycle.phase = 'closing';
      return;
    case 'closed':
      lifecycle.phase = 'closed';
      lifecycle.reason = null;
      return;
  }
}

export function isNarsTransportOpening(lifecycle: NarsTransportLifecycle): boolean {
  return lifecycle.phase === 'opening' || lifecycle.phase === 'replaying';
}

export function isNarsTransportClosed(lifecycle: NarsTransportLifecycle): boolean {
  return lifecycle.phase === 'closing' || lifecycle.phase === 'closed';
}

export interface NarsClientState {
  socket: WebSocket | null;
  lifecycle: NarsTransportLifecycle;
  lastSequence: number | null;
  activeTurnId: string | boolean | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  remotePageTimer: ReturnType<typeof setTimeout> | null;
  reconcileTimer: ReturnType<typeof setTimeout> | null;
  socketGeneration: number;
  view: string;
  subscribeView?: (view: string) => boolean;
}

export interface NarsClientAdapterContext {
  options: NarsClientOptions;
  connection: NarsClientConnection;
  state: NarsClientState;
  WebSocketCtor: typeof WebSocket;
  setTimeoutFn: typeof globalThis.setTimeout;
  clearTimeoutFn: typeof globalThis.clearTimeout;
}

export function projectionHeaders(browserToken: string | null | undefined): Record<string, string> {
  return browserToken ? { 'x-narada-browser-token-fingerprint': browserToken } : {};
}
