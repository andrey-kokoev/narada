export type JsonObject = Record<string, unknown>;

export type ProjectionClass = 'conversation' | 'operations' | 'diagnostics' | 'raw';

export type PiRenderableContent =
  | { type: 'text'; text: string }
  | { type: 'artifact_ref'; artifact_id: string; kind?: string; title?: string; render_hint?: string }
  | { type: 'intent_ref'; intent: string; label?: string; description?: string; target?: string; action?: string }
  | { type: 'image'; artifact_id: string; mime_type?: string; alt?: string };

export interface NarsProtocolFrame extends JsonObject {
  id: string;
  method: string;
  params?: JsonObject;
}

export interface NarsEvent extends JsonObject {
  event?: string;
  event_id?: string;
  event_sequence?: number;
  sequence?: number;
  request_id?: string;
  idempotency_key?: string;
  turn_id?: string;
  timestamp?: string;
}

export interface PiRowIdentity {
  id?: string;
  label?: string;
  role?: string;
}

export interface PiRowViewModel {
  renderKey: string;
  projectionClass: ProjectionClass;
  kind: string;
  identity?: PiRowIdentity;
  content: PiRenderableContent[];
  tone?: string;
  status?: string;
  timestamp?: string;
  sequence?: number;
  expandable?: boolean;
  expandedByDefault?: boolean;
  pending?: boolean;
  terminal?: boolean;
  event: NarsEvent;
}

export type AttachPhase =
  | 'idle'
  | 'connecting'
  | 'replaying'
  | 'live'
  | 'recovering'
  | 'reconnect_wait'
  | 'closing'
  | 'closed'
  | 'failed';

export interface AttachState {
  phase: AttachPhase;
  endpoint: string;
  transportReady: boolean;
  reconnectAttempt: number;
  lastEventSequence: number | null;
  replayAttempt: number;
  subscriptionId: string;
  lastTransportError: string | null;
}

export interface CursorStore {
  load(key: string): Promise<number | null> | number | null;
  save(key: string, sequence: number): Promise<void> | void;
}

export interface WebSocketLike {
  readonly readyState?: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener?(event: string, listener: (value: unknown) => void): void;
  removeEventListener?(event: string, listener: (value: unknown) => void): void;
  on?(event: string, listener: (value: unknown) => void): void;
  off?(event: string, listener: (value: unknown) => void): void;
  onopen?: ((value: unknown) => void) | null;
  onmessage?: ((value: unknown) => void) | null;
  onerror?: ((value: unknown) => void) | null;
  onclose?: ((value: unknown) => void) | null;
}

export type WebSocketConstructor = new (endpoint: string) => WebSocketLike;

export type DurableAdmission = 'not_admitted' | 'unknown' | 'accepted' | 'rejected';
export type TransportWriteState = 'not_sent' | 'queued' | 'written' | 'ambiguous';

export interface TransportWriteResult {
  requestId: string;
  method: string;
  transport: TransportWriteState;
  durableAdmission: DurableAdmission;
  retryAllowed: boolean;
  idempotencyKey?: string;
  error?: string;
}

export type InputDeliveryPhase =
  | 'created'
  | 'queued_before_live'
  | 'transport_written'
  | 'durable_admitted'
  | 'durable_rejected'
  | 'ambiguous_transport'
  | 'completed'
  | 'abandoned';

export interface PendingInput {
  requestId: string;
  idempotencyKey: string;
  content: string;
  phase: InputDeliveryPhase;
  deliveryMode: 'immediate' | 'admit_after_active_turn';
  createdAt: string;
  lastEventKind?: string;
}

export interface PiTheme {
  name: string;
  accent: string;
  muted: string;
  assistant: string;
  operator: string;
  tool: string;
  success: string;
  warning: string;
  error: string;
  diagnostic: string;
}

export type ScrollAuthorityMode = 'auto_follow' | 'operator_controlled' | 'force_follow_once';

export interface PiClientLocalState {
  composerDraft: string;
  composerHistory: string[];
  focus: 'composer' | 'transcript' | 'overlay';
  currentView: ProjectionClass;
  theme: PiTheme;
  expandedRows: ReadonlySet<string>;
  selectedRow: string | null;
  overlay: 'none' | 'help' | 'selector' | 'diagnostics';
  scrollMode: ScrollAuthorityMode;
  scrollOffset: number;
  connection: AttachPhase;
  transportError: string | null;
}

