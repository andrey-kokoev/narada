export type IntelligenceKernelKind = 'narada-native' | 'pi-sdk' | 'pi-rpc';
export type OperatorSurfaceKind = 'agent-cli' | 'agent-tui' | 'agent-web-ui' | 'agent-pi-tui';
export type RuntimeHostKind = 'narada-agent-runtime-server';
export type NarsKernelState = 'created' | 'starting' | 'ready' | 'running' | 'cancelling' | 'reconfiguring' | 'recovering' | 'closed' | 'failed';
export type NarsKernelTerminalState = 'completed' | 'failed' | 'interrupted' | 'refused';
export type NarsJsonRecord = Readonly<Record<string, unknown>>;
export interface NarsExecutionPolicy {
  schema: 'narada.nars.execution_policy.v1';
  scope: string;
  source: {
    kind: string;
    ref: string | null;
    revision: number | string;
  };
  tool_loop: {
    max_rounds: number;
  };
}
export type NarsKernelEventKind =
  | 'kernel_provider_request_started'
  | 'kernel_provider_request_completed'
  | 'kernel_provider_telemetry'
  | 'kernel_failure'
  | 'kernel_turn_started'
  | 'assistant_message_stream'
  | 'kernel_provider_failure'
  | 'kernel_turn_observed'
  | 'kernel_cancellation_evidence'
  | 'pi_event_observed'
  | 'pi_event_unsupported'
  | 'pi_event_malformed'
  | 'pi_event_duplicate'
  | 'pi_tool_proxy_refused'
  | 'pi_tool_proxy_requested'
  | 'carrier_tool_requested'
  | 'pi_tool_proxy_result_observed'
  | 'carrier_tool_completed'
  | 'pi_compaction_evidence'
  | 'pi_retry_telemetry'
  | 'pi_artifact_reference_observed'
  | 'pi_artifact_registration_required'
  | 'pi_artifact_registered'
  | 'process_exit';

export interface NarsMessageRecord {
  role: string;
  content?: unknown;
  name?: string | null;
  tool_calls?: readonly NarsJsonRecord[];
  tool_call_id?: string | null;
}

export interface NarsToolDescriptor {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: NarsJsonRecord;
  };
  nars_gateway_proxy: true;
  capability_identity?: string | null;
}

export interface NarsAdmittedPlan {
  schema?: string;
  id?: string;
  plan_id?: string;
  selected?: NarsJsonRecord;
  options?: NarsJsonRecord;
  access?: NarsJsonRecord;
  admission_evidence?: NarsJsonRecord;
  correlation_key?: string | null;
}

export interface NarsGatewayInvocation {
  toolName: string;
  tool_name?: string;
  arguments: unknown;
  turnId?: string | null;
  inputEventId?: string | null;
  runtimeRequestId?: string | null;
  idempotencyKey?: string | null;
  turnAttempt?: number;
  toolCallId?: string | null;
  piMessageId?: string | null;
  capabilityIdentity?: string | null;
  authorityPosture?: string | null;
  admissionEvidence?: NarsJsonRecord;
  executionEvidence?: NarsJsonRecord;
  resultReference?: NarsJsonRecord;
  reconciliationState?: string | null;
  correlationKey?: string | null;
}

export interface NarsGatewayResult {
  status: 'allowed' | 'denied' | 'failed' | 'unknown';
  admission_action: 'admit' | 'deny';
  execution_outcome?: 'completed' | 'failed' | 'unknown' | 'not_attempted';
  effect_confirmation?: 'confirmed' | 'not-confirmed' | 'unknown';
  reason?: string;
  admission_reason?: string;
  tool_name?: string | null;
  result_reference?: NarsJsonRecord;
}

export interface NarsAdmittedInput {
  input_id: string;
  idempotency_key?: string | null;
  turn_id?: string | null;
  input_event_id?: string | null;
  content?: unknown;
  metadata?: NarsJsonRecord;
  authority_posture?: string | null;
  admission_evidence?: NarsJsonRecord;
  correlation_key?: string | null;
}

export interface NarsAdmittedTurn {
  turn_id: string;
  input_id?: string;
  input_event_id?: string;
  runtime_request_id?: string | null;
  idempotency_key?: string | null;
  turn_attempt?: number;
  attempt?: number;
  messages?: readonly NarsMessageRecord[];
  tools?: readonly NarsToolDescriptor[];
  settings?: NarsJsonRecord;
  provider_invocation?: NarsJsonRecord;
  provider_request_attempt?: number | null;
  abortSignal?: AbortSignal | null;
  metadata?: NarsJsonRecord;
  authority_posture?: string | null;
  admission_evidence?: NarsJsonRecord;
  execution_evidence?: NarsJsonRecord;
  correlation_key?: string | null;
  request_id?: string | null;
  execution_policy?: NarsExecutionPolicy;
  executionPolicy?: NarsExecutionPolicy;
}

export interface NarsKernelEvent {
  kind: NarsKernelEventKind;
  turn_id?: string | null;
  input_id?: string | null;
  input_event_id?: string | null;
  runtime_request_id?: string | null;
  idempotency_key?: string | null;
  correlation_key?: string | null;
  turn_attempt?: number;
  provider_request_attempt?: number;
  tool_call_id?: string | null;
  sequence?: number;
  timestamp?: string;
  event_id?: string | null;
  pi_event_id?: string | null;
  pi_event_kind?: string | null;
  source_event?: NarsJsonRecord;
  payload?: unknown;
  error?: NarsJsonRecord;
  authority_posture?: string | null;
  admission_evidence?: NarsJsonRecord;
  execution_evidence?: NarsJsonRecord;
  result_reference?: NarsJsonRecord;
  reconciliation_state?: string | null;
  terminal_state?: NarsKernelTerminalState;
}

export type NarsKernelEventSink = (event: NarsKernelEvent) => void | Promise<void>;

export interface NarsKernelCapabilityGateway {
  toolCatalog: () => Promise<readonly NarsToolDescriptor[]> | readonly NarsToolDescriptor[];
  invoke: (request: NarsGatewayInvocation) => Promise<NarsGatewayResult>;
  close: () => Promise<void> | void;
}

export interface NarsToolRound {
  schema: 'narada.nars.tool_round.v1';
  owner: 'nars-session-core-carrier';
  turn_id: string;
  input_id: string;
  input_event_id: string;
  turn_attempt: number;
  provider_request_attempt: number | null;
  execution_policy: NarsExecutionPolicy;
  messages: readonly NarsMessageRecord[];
  tools: readonly NarsToolDescriptor[];
  abort_signal: AbortSignal | null;
  capability_gateway: NarsKernelCapabilityGateway;
  tool_loop: {
    schema: 'narada.nars.tool_round.v1';
    owner: 'nars-session-core-carrier';
    result_authority: 'nars-capability-gateway';
    terminal_authority: 'nars-session-core';
    execution_policy: NarsExecutionPolicy;
  };
}

export interface NarsKernelStartContext {
  session_id: string;
  agent_id: string;
  runtime_context?: Record<string, unknown>;
  provider?: unknown;
  model?: unknown;
  thinking?: string | null;
  tools?: readonly NarsToolDescriptor[];
  execution_policy?: NarsExecutionPolicy;
  executionPolicy?: NarsExecutionPolicy;
}

export interface NarsKernelStartEvidence {
  schema: string;
  kernel_kind: IntelligenceKernelKind;
  kernel_version: string;
  pi_version: string | null;
  pi_mode: string | null;
  supported_capabilities: readonly string[];
  supported_provider_features: readonly string[];
  supported_thinking_levels: readonly string[];
  tool_posture_version: string;
  event_adapter_version: string;
  session_posture: string;
  ambient_resource_isolation: string;
  session_id: string | null;
  started_at: string;
}

export interface NarsKernelTurnResult {
  terminal_state: NarsKernelTerminalState;
  response?: unknown;
  provider_outcome?: unknown;
  retry?: unknown;
  error?: NarsJsonRecord;
}

export interface NarsKernelInputAcceptance {
  accepted: boolean;
  input_id: string;
  reason: string;
  turn_id?: string | null;
}

export interface NarsKernelCancelRequest {
  request_id?: string | null;
  turn_id?: string | null;
  reason?: string | null;
}

export interface NarsKernelCancellationEvidence {
  accepted: boolean;
  cancellation_requested: boolean;
  confirmed: boolean;
  turn_id?: string | null;
  reason?: string;
}

export interface NarsKernelReconfigurationRequest {
  admitted_plan?: NarsAdmittedPlan;
  execution_policy?: NarsExecutionPolicy;
  executionPolicy?: NarsExecutionPolicy;
}

export interface NarsKernelReconfigurationEvidence {
  accepted: boolean;
  reason?: string;
  active?: NarsJsonRecord;
  active_turn_id?: string | null;
}

export interface NarsKernelHealthProjection {
  schema: string;
  kernel_kind: IntelligenceKernelKind;
  kernel_version: string;
  pi_version: string | null;
  pi_mode: string | null;
  provider: string | null;
  model: string | null;
  thinking: string | null;
  execution_policy: NarsExecutionPolicy;
  kernel_state: NarsKernelState;
  active_turn_id: string | null;
  provider_streaming: boolean;
  compaction_state: string;
  retry_state: string;
  continuation_state_present: boolean;
  capability_profile: unknown;
  last_kernel_error: unknown;
  supported_capabilities?: readonly string[];
}

export interface NarsKernelCloseRequest {
  reason?: string | null;
}

export interface NarsKernelCloseEvidence {
  closed: boolean;
  reason: string;
  active_turn_id?: string | null;
  joined?: boolean;
}

export interface NarsIntelligenceKernel {
  start(context: NarsKernelStartContext): Promise<NarsKernelStartEvidence>;
  runTurn(turn: NarsAdmittedTurn, eventSink: NarsKernelEventSink, capabilityGateway: NarsKernelCapabilityGateway): Promise<NarsKernelTurnResult>;
  steer(input: NarsAdmittedInput): Promise<NarsKernelInputAcceptance>;
  cancel(request?: NarsKernelCancelRequest): Promise<NarsKernelCancellationEvidence>;
  reconfigure(request?: NarsKernelReconfigurationRequest): Promise<NarsKernelReconfigurationEvidence>;
  inspect(): Promise<NarsKernelHealthProjection>;
  close(request?: NarsKernelCloseRequest): Promise<NarsKernelCloseEvidence>;
}

export const INTELLIGENCE_KERNEL_KINDS: readonly IntelligenceKernelKind[];
export const OPERATOR_SURFACE_KINDS: readonly OperatorSurfaceKind[];
export const RUNTIME_HOST_KINDS: readonly RuntimeHostKind[];
export const KERNEL_STATES: readonly NarsKernelState[];
export const KERNEL_TERMINAL_STATES: readonly NarsKernelTerminalState[];
export const NARS_KERNEL_EVENT_KINDS: readonly NarsKernelEventKind[];
export const NARS_TOOL_ROUND_SCHEMA: 'narada.nars.tool_round.v1';
export const NARS_TOOL_LOOP_OWNER: 'nars-session-core-carrier';
export const NARS_EXECUTION_POLICY_SCHEMA: 'narada.nars.execution_policy.v1';
export const NARS_EXECUTION_POLICY_DEFAULT_MAX_ROUNDS: 200;
export const NARS_EXECUTION_POLICY_MIN_MAX_ROUNDS: 1;
export const NARS_EXECUTION_POLICY_MAX_MAX_ROUNDS: 500;
export class NarsKernelContractError extends Error {
  code: string;
  details: Record<string, unknown>;
}
export function isIntelligenceKernelKind(value: unknown): value is IntelligenceKernelKind;
export function normalizeIntelligenceKernelKind(value: unknown, options?: { defaultKind?: IntelligenceKernelKind }): IntelligenceKernelKind;
export function assertIntelligenceKernelKind(value: unknown, options?: { defaultKind?: IntelligenceKernelKind }): IntelligenceKernelKind;
export function isOperatorSurfaceKind(value: unknown): value is OperatorSurfaceKind;
export function normalizeNarsExecutionPolicy(value?: unknown, options?: {
  defaultMaxRounds?: number;
  sourceKind?: string;
  sourceRef?: string | null;
  revision?: number | string;
  scope?: string;
}): NarsExecutionPolicy;
export function assertNarsExecutionPolicy(value?: unknown, options?: {
  defaultMaxRounds?: number;
  sourceKind?: string;
  sourceRef?: string | null;
  revision?: number | string;
  scope?: string;
}): NarsExecutionPolicy;
export function assertNarsKernelStartContext(context: unknown): NarsKernelStartContext;
export function assertNarsAdmittedTurn(turn: unknown): NarsAdmittedTurn;
export function createNarsToolRound(options: {
  turn: NarsAdmittedTurn;
  messages?: readonly NarsMessageRecord[] | null;
  tools?: readonly NarsToolDescriptor[] | null;
  capabilityGateway: NarsKernelCapabilityGateway;
  abortSignal?: AbortSignal | null;
  providerRequestAttempt?: number | null;
}): NarsToolRound;
export function assertNarsAdmittedInput(input: unknown): NarsAdmittedInput;
export function assertNarsKernelCapabilityGateway(gateway: unknown): NarsKernelCapabilityGateway;
export function assertNarsKernelEventSink(eventSink: unknown): NarsKernelEventSink;
export function isKernelTerminalState(value: unknown): value is NarsKernelTerminalState;
export function buildKernelHealthProjection(options: Record<string, unknown>): NarsKernelHealthProjection;
export function buildKernelStartEvidence(options: Record<string, unknown> & { startedAt?: string }): NarsKernelStartEvidence;
