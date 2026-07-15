import type { NarsTransportLifecycle } from './sessionTransportAdapters';

export interface SessionProtocolFrame {
  id?: string;
  method: string;
  params?: Record<string, unknown>;
}

export { toSessionProtocolFrame } from './session-frame.js';

export type SessionTransportKind = 'local-websocket' | 'cloudflare-projection';

export interface SessionTransport {
  readonly lifecycle: Readonly<NarsTransportLifecycle>;
  readonly activeTurnId: string | boolean | null;
  readonly lastSequence: number | null;
  readonly kind: SessionTransportKind;
  readonly healthEndpoint: string | null;
  getSocket(): WebSocket | null;
  requestHealth(fetchFn?: typeof fetch): Promise<Response> | null;
  sendFrame(frame: SessionProtocolFrame): boolean;
  subscribeView(view: string): boolean;
  readEventsPage(options: { view?: string; beforeSequence?: number; afterSequence?: number; direction?: 'forward' | 'backward'; limit?: number }): boolean;
  close(): void;
}
