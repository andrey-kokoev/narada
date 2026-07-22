import { randomUUID } from 'node:crypto';
import type {
  AttachPhase,
  AttachState,
  CursorStore,
  NarsEvent,
  NarsProtocolFrame,
  TransportWriteResult,
  WebSocketConstructor,
  WebSocketLike,
} from '../types.js';
import { durableEventIdentity, durableEventSequence, extractDurableEvents, isReplayCompletedEvent } from './event-stream.js';
import { canReconnect, initialAttachState, MemoryCursorStore, reconnectDelay } from './reconnect.js';
import { boundedReplayFrame } from './replay.js';
import { addSocketListener, closeSocket, socketIsOpen } from './transport.js';
import { buildCancelFrame, buildCloseFrame, buildHealthFrame, buildRecoveryFrame, buildRuntimeReconfigureFrame, buildSubmitFrame } from './protocol.js';
import { PendingInputLedger } from './input-delivery.js';

export interface NarsAttachClientOptions {
  endpoint: string;
  sessionId?: string | null;
  subscriptionId?: string;
  WebSocketImpl?: WebSocketConstructor;
  cursorStore?: CursorStore;
  cursorKey?: string;
  replayPageSize?: number;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  now?: () => Date;
}

export interface AttachEventDetail {
  event: NarsEvent;
  sequence: number | null;
  replay: boolean;
}

export interface TransportErrorDetail {
  error: Error;
  ambiguousRequestId?: string;
}

type Listener<T> = (value: T) => void;

function normalizeEndpoint(value: string): string {
  const endpoint = String(value ?? '').trim();
  if (!/^wss?:\/\//i.test(endpoint)) throw new Error('nars_attach_endpoint_must_be_ws_url');
  return endpoint;
}

function errorFrom(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(value == null ? fallback : String(value));
}

export class NarsAttachClient {
  private readonly endpoint: string;
  private readonly sessionId: string | null;
  private readonly subscriptionId: string;
  private readonly WebSocketImpl: WebSocketConstructor;
  private readonly cursorStore: CursorStore;
  private readonly cursorKey: string;
  private readonly replayPageSize: number;
  private readonly reconnectEnabled: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly now: () => Date;
  private readonly eventListeners = new Set<Listener<AttachEventDetail>>();
  private readonly stateListeners = new Set<Listener<AttachState>>();
  private readonly transportErrorListeners = new Set<Listener<TransportErrorDetail>>();
  private readonly seenEventIdentities = new Set<string>();
  private readonly pendingBeforeLive: NarsProtocolFrame[] = [];
  private readonly pendingInputs = new PendingInputLedger();
  private state: AttachState;
  private socket: WebSocketLike | null = null;
  private socketGeneration = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private localClose = false;
  private preLiveQueueEnabled = true;
  private connectedPromise: Promise<void> | null = null;
  private resolveConnected: (() => void) | null = null;
  private rejectConnected: ((error: Error) => void) | null = null;

  constructor(options: NarsAttachClientOptions) {
    this.endpoint = normalizeEndpoint(options.endpoint);
    this.sessionId = options.sessionId ?? null;
    this.subscriptionId = options.subscriptionId ?? `agent-pi-tui-events-${randomUUID()}`;
    const implementation = options.WebSocketImpl ?? globalThis.WebSocket;
    if (typeof implementation !== 'function') throw new Error('nars_attach_websocket_unavailable');
    this.WebSocketImpl = implementation as WebSocketConstructor;
    this.cursorStore = options.cursorStore ?? new MemoryCursorStore();
    this.cursorKey = options.cursorKey ?? `${this.sessionId ?? this.endpoint}::${this.subscriptionId}`;
    this.replayPageSize = Math.max(1, Math.min(Math.floor(options.replayPageSize ?? 100), 1000));
    this.reconnectEnabled = options.reconnect !== false;
    this.maxReconnectAttempts = Math.max(0, Math.floor(options.maxReconnectAttempts ?? 8));
    this.reconnectBaseDelayMs = Math.max(0, options.reconnectBaseDelayMs ?? 100);
    this.reconnectMaxDelayMs = Math.max(this.reconnectBaseDelayMs, options.reconnectMaxDelayMs ?? 30_000);
    this.now = options.now ?? (() => new Date());
    this.state = initialAttachState(this.endpoint, this.subscriptionId);
  }

  onEvent(listener: Listener<AttachEventDetail>): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onState(listener: Listener<AttachState>): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  onTransportError(listener: Listener<TransportErrorDetail>): () => void {
    this.transportErrorListeners.add(listener);
    return () => this.transportErrorListeners.delete(listener);
  }

  getState(): AttachState {
    return { ...this.state };
  }

  getPendingInputs() {
    return this.pendingInputs.snapshot();
  }

  async connect(): Promise<void> {
    if (this.state.phase === 'live' || this.state.phase === 'replaying' || this.state.phase === 'recovering') return;
    if (this.state.phase === 'closing' || this.state.phase === 'closed') throw new Error('nars_attach_client_closed');
    if (this.connectedPromise) return this.connectedPromise;
    const savedCursor = await Promise.resolve(this.cursorStore.load(this.cursorKey));
    if (this.state.lastEventSequence === null && savedCursor !== null) {
      this.state = { ...this.state, lastEventSequence: savedCursor };
    }
    this.localClose = false;
    this.preLiveQueueEnabled = this.state.reconnectAttempt === 0;
    this.transition('connecting');
    this.connectedPromise = new Promise<void>((resolve, reject) => {
      this.resolveConnected = resolve;
      this.rejectConnected = reject;
    });
    this.openSocket();
    return this.connectedPromise;
  }

  /** Detach only this projection socket. It never sends session.close. */
  async disconnect(): Promise<void> {
    this.localClose = true;
    this.clearReconnectTimer();
    if (this.state.phase === 'closed') return;
    this.transition('closing', false);
    closeSocket(this.socket);
    this.socket = null;
    this.transition('closed');
    this.resolveConnected?.();
    this.clearConnectionPromise();
  }

  async closeSession(): Promise<TransportWriteResult> {
    const result = await this.sendFrame(buildCloseFrame());
    await this.disconnect();
    return result;
  }

  async submit(content: string, options: { activeTurnId?: string; deliveryMode?: 'immediate' | 'admit_after_active_turn'; idempotencyKey?: string; id?: string } = {}): Promise<TransportWriteResult> {
    const frame = buildSubmitFrame(content, options);
    if (!frame) throw new Error('nars_submit_content_empty');
    this.pendingInputs.admit(frame, content.trim(), options.deliveryMode ?? 'immediate', this.now());
    const result = await this.sendFrame(frame);
    if (result.transport === 'queued') this.pendingInputs.mark(frame.id, 'queued_before_live');
    if (result.transport === 'written') this.pendingInputs.mark(frame.id, 'transport_written');
    if (result.transport === 'ambiguous') this.pendingInputs.mark(frame.id, 'ambiguous_transport');
    return result;
  }

  async sendOperatorFrame(frame: NarsProtocolFrame, content: string, deliveryMode: 'immediate' | 'admit_after_active_turn' = 'immediate'): Promise<TransportWriteResult> {
    this.pendingInputs.admit(frame, content.trim(), deliveryMode, this.now());
    const result = await this.sendFrame(frame);
    if (result.transport === 'queued') this.pendingInputs.mark(frame.id, 'queued_before_live');
    if (result.transport === 'written') this.pendingInputs.mark(frame.id, 'transport_written');
    if (result.transport === 'ambiguous') this.pendingInputs.mark(frame.id, 'ambiguous_transport');
    return result;
  }

  async health(): Promise<TransportWriteResult> {
    return this.sendFrame(buildHealthFrame());
  }

  async recovery(): Promise<TransportWriteResult> {
    return this.sendFrame(buildRecoveryFrame());
  }

  async cancel(): Promise<TransportWriteResult> {
    return this.sendFrame(buildCancelFrame());
  }

  async reconfigure(input: { provider?: string; model?: string; thinking?: string; id?: string }): Promise<TransportWriteResult> {
    const frame = buildRuntimeReconfigureFrame(input);
    if (!frame) throw new Error('nars_intelligence_reconfigure_input_empty');
    return this.sendFrame(frame);
  }

  async readEvents(options: { limit?: number; view?: 'conversation' | 'operations' | 'diagnostics' | 'raw'; id?: string } = {}): Promise<TransportWriteResult> {
    const frame: NarsProtocolFrame = {
      id: options.id ?? `agent-pi-tui-events-read-${randomUUID()}`,
      method: 'session.events.read',
      params: {
        limit: Math.max(1, Math.min(Math.floor(options.limit ?? 100), 1000)),
        after_sequence: this.state.lastEventSequence ?? undefined,
        ...(options.view ? { view: options.view } : {}),
      },
    };
    return this.sendFrame(frame);
  }

  /**
   * Send a frame and report transport separately from NARS durable admission.
   * A successful WebSocket write is intentionally reported as `unknown`.
   */
  async sendFrame(frame: NarsProtocolFrame): Promise<TransportWriteResult> {
    if (this.state.phase === 'closed' || this.state.phase === 'closing' || this.state.phase === 'failed') {
      return { requestId: frame.id, method: frame.method, transport: 'not_sent', durableAdmission: 'not_admitted', retryAllowed: false, error: 'nars_attach_client_not_connected' };
    }
    if (!this.socket || !socketIsOpen(this.socket) || (this.state.phase !== 'live' && this.state.phase !== 'recovering')) {
      if (this.preLiveQueueEnabled && (this.state.phase === 'connecting' || this.state.phase === 'replaying')) {
        this.pendingBeforeLive.push(frame);
        return { requestId: frame.id, method: frame.method, transport: 'queued', durableAdmission: 'not_admitted', retryAllowed: false, idempotencyKey: this.idempotencyKeyOf(frame) };
      }
      return { requestId: frame.id, method: frame.method, transport: 'not_sent', durableAdmission: 'not_admitted', retryAllowed: false, idempotencyKey: this.idempotencyKeyOf(frame), error: 'nars_attach_transport_not_ready' };
    }
    try {
      this.socket.send(JSON.stringify(frame));
      return { requestId: frame.id, method: frame.method, transport: 'written', durableAdmission: 'unknown', retryAllowed: false, idempotencyKey: this.idempotencyKeyOf(frame) };
    } catch (error) {
      const normalized = errorFrom(error, 'nars_attach_socket_write_failed');
      this.reportTransportError(normalized, frame.id);
      this.beginReconnect(normalized);
      return { requestId: frame.id, method: frame.method, transport: 'ambiguous', durableAdmission: 'unknown', retryAllowed: false, idempotencyKey: this.idempotencyKeyOf(frame), error: normalized.message };
    }
  }

  private idempotencyKeyOf(frame: NarsProtocolFrame): string | undefined {
    return typeof frame.params?.idempotency_key === 'string' ? frame.params.idempotency_key : undefined;
  }

  private openSocket(): void {
    const generation = ++this.socketGeneration;
    let socket: WebSocketLike;
    try {
      socket = new this.WebSocketImpl(this.endpoint);
    } catch (error) {
      const normalized = errorFrom(error, 'nars_attach_socket_create_failed');
      this.reportTransportError(normalized);
      this.rejectConnected?.(normalized);
      this.clearConnectionPromise();
      this.beginReconnect(normalized);
      return;
    }
    this.socket = socket;
    const current = () => !this.localClose && generation === this.socketGeneration && socket === this.socket;
    addSocketListener(socket, 'open', () => {
      if (!current()) return;
      this.state = { ...this.state, transportReady: true, reconnectAttempt: 0, replayAttempt: this.state.replayAttempt + 1, lastTransportError: null };
      this.transition('replaying');
      const subscribe = boundedReplayFrame({
        subscriptionId: this.subscriptionId,
        attempt: this.state.replayAttempt,
        sinceSequence: this.state.lastEventSequence,
        pageSize: this.replayPageSize,
      });
      try {
        socket.send(JSON.stringify(subscribe));
        this.resolveConnected?.();
        this.clearConnectionPromise();
      } catch (error) {
        const normalized = errorFrom(error, 'nars_attach_subscribe_write_failed');
        this.reportTransportError(normalized, subscribe.id);
        this.beginReconnect(normalized);
      }
    });
    addSocketListener(socket, 'message', (value) => {
      if (!current()) return;
      this.receive(value);
    });
    addSocketListener(socket, 'error', (value) => {
      if (!current()) return;
      const error = errorFrom(value, 'nars_attach_websocket_error');
      this.reportTransportError(error);
      this.beginReconnect(error);
    });
    addSocketListener(socket, 'close', () => {
      if (!current()) return;
      this.socket = null;
      if (this.localClose || this.state.phase === 'closing') {
        this.transition('closed');
        return;
      }
      this.beginReconnect(new Error('nars_attach_websocket_closed'));
    });
  }

  private receive(value: unknown): void {
    const events = extractDurableEvents(value);
    for (const event of events) this.receiveEvent(event);
  }

  private receiveEvent(event: NarsEvent): void {
    if (event.event === 'websocket_connected') return;
    if (event.event === 'websocket_error') {
      const message = typeof event.message === 'string' && event.message.trim()
        ? event.message
        : typeof event.code === 'string' && event.code.trim()
          ? event.code
          : 'nars_attach_websocket_error';
      const error = new Error(message);
      this.state = { ...this.state, lastTransportError: error.message };
      this.reportTransportError(error, typeof event.request_id === 'string' ? event.request_id : undefined);
      return;
    }
    const sequence = durableEventSequence(event);
    const identity = durableEventIdentity(event);
    const replayCompleted = isReplayCompletedEvent(event);
    if (identity && this.seenEventIdentities.has(identity) && !replayCompleted) return;
    const replaying = this.state.phase === 'replaying' || this.state.phase === 'recovering';
    if (sequence !== null && this.state.lastEventSequence !== null && sequence <= this.state.lastEventSequence && !replaying && !replayCompleted) return;
    if (sequence !== null && this.state.lastEventSequence !== null && sequence > this.state.lastEventSequence + 1 && !replaying && !replayCompleted) {
      this.transition('recovering');
      this.sendReplayAfterGap();
      return;
    }
    if (identity) this.seenEventIdentities.add(identity);
    if (sequence !== null && (this.state.lastEventSequence === null || sequence > this.state.lastEventSequence)) {
      this.state = { ...this.state, lastEventSequence: sequence };
      void Promise.resolve(this.cursorStore.save(this.cursorKey, sequence));
    }
    this.pendingInputs.observe(event);
    const replay = this.state.phase === 'replaying' || this.state.phase === 'recovering';
    for (const listener of this.eventListeners) listener({ event, sequence, replay });
    if (replayCompleted) {
      this.transition('live');
      this.flushPreLiveFrames();
    }
  }

  private sendReplayAfterGap(): void {
    if (!this.socket || !socketIsOpen(this.socket)) return;
    const frame = boundedReplayFrame({
      subscriptionId: this.subscriptionId,
      attempt: this.state.replayAttempt + 1,
      sinceSequence: this.state.lastEventSequence,
      pageSize: this.replayPageSize,
    });
    this.state = { ...this.state, replayAttempt: this.state.replayAttempt + 1 };
    try {
      this.socket.send(JSON.stringify(frame));
    } catch (error) {
      const normalized = errorFrom(error, 'nars_attach_recovery_subscribe_failed');
      this.reportTransportError(normalized, frame.id);
      this.beginReconnect(normalized);
    }
  }

  private flushPreLiveFrames(): void {
    if (!this.socket || !socketIsOpen(this.socket)) return;
    const queued = this.pendingBeforeLive.splice(0);
    for (const frame of queued) {
      try {
        this.socket.send(JSON.stringify(frame));
        this.pendingInputs.mark(frame.id, 'transport_written');
      } catch (error) {
        const normalized = errorFrom(error, 'nars_attach_queued_frame_write_failed');
        this.pendingInputs.mark(frame.id, 'ambiguous_transport');
        this.reportTransportError(normalized, frame.id);
        this.beginReconnect(normalized);
        break;
      }
    }
  }

  private beginReconnect(error: Error): void {
    if (this.localClose || this.state.phase === 'closing' || this.state.phase === 'closed') return;
    this.state = {
      ...this.state,
      transportReady: false,
      reconnectAttempt: this.state.reconnectAttempt + 1,
      lastTransportError: error.message,
    };
    this.socket = null;
    if (!canReconnect(this.state.phase, this.state.reconnectAttempt, this.maxReconnectAttempts, this.reconnectEnabled)) {
      this.transition('failed');
      this.rejectConnected?.(error);
      this.clearConnectionPromise();
      return;
    }
    this.preLiveQueueEnabled = false;
    this.transition('reconnect_wait');
    this.clearReconnectTimer();
    const delay = reconnectDelay(this.state.reconnectAttempt, this.reconnectBaseDelayMs, this.reconnectMaxDelayMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.localClose) return;
      this.transition('connecting');
      this.openSocket();
    }, delay);
  }

  private reportTransportError(error: Error, ambiguousRequestId?: string): void {
    for (const listener of this.transportErrorListeners) listener({ error, ...(ambiguousRequestId ? { ambiguousRequestId } : {}) });
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearConnectionPromise(): void {
    this.connectedPromise = null;
    this.resolveConnected = null;
    this.rejectConnected = null;
  }

  private transition(phase: AttachPhase, notify = true): void {
    this.state = { ...this.state, phase };
    if (!notify) return;
    const snapshot = this.getState();
    for (const listener of this.stateListeners) listener(snapshot);
  }
}

export function createNarsAttachClient(options: NarsAttachClientOptions): NarsAttachClient {
  return new NarsAttachClient(options);
}
