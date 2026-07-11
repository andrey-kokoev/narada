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

export function createNarsTransportLifecycle(configured: boolean): NarsTransportLifecycle {
  return {
    phase: configured ? 'idle' : 'unconfigured',
    attempt: 0,
    reason: null,
    disconnectedAt: null,
  };
}

export function transitionNarsTransport(lifecycle: NarsTransportLifecycle, event: NarsTransportEvent): void {
  switch (event.type) {
    case 'open_requested':
      if (lifecycle.phase === 'idle' || lifecycle.phase === 'reconnecting') {
        lifecycle.phase = 'opening';
        lifecycle.reason = null;
      }
      return;
    case 'replay_started':
      if (lifecycle.phase === 'opening') lifecycle.phase = 'replaying';
      return;
    case 'connected':
      if (lifecycle.phase === 'opening' || lifecycle.phase === 'replaying') {
        lifecycle.phase = 'live';
        lifecycle.attempt = 0;
        lifecycle.reason = null;
        lifecycle.disconnectedAt = null;
      }
      return;
    case 'reconnect_scheduled':
      if (lifecycle.phase === 'closing' || lifecycle.phase === 'closed' || lifecycle.phase === 'unconfigured') return;
      lifecycle.phase = 'reconnecting';
      lifecycle.attempt += 1;
      lifecycle.reason = event.reason;
      lifecycle.disconnectedAt ??= event.at ?? Date.now();
      return;
    case 'close_requested':
      if (lifecycle.phase !== 'closed') lifecycle.phase = 'closing';
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
