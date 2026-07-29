export const NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD: 'runtime.intelligence.reconfigure';
export const NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_CANCEL_METHOD: 'runtime.intelligence.reconfigure.cancel';
export const NARS_RUNTIME_EXECUTION_POLICY_RECONFIGURE_METHOD: 'runtime.execution_policy.reconfigure';
export const NARS_RUNTIME_SERVER_METHOD_LIST: readonly ['runtime.intelligence.reconfigure', 'runtime.intelligence.reconfigure.cancel', 'runtime.execution_policy.reconfigure'];
export const NARS_RUNTIME_SERVER_METHODS: ReadonlySet<string>;
export function isNarsRuntimeServerMethod(method: unknown): boolean;
export function buildNarsRuntimeIntelligenceReconfigureFrame(input?: {
  provider?: unknown;
  model?: unknown;
  thinking?: unknown;
  inferenceProvider?: unknown;
  inference_provider?: unknown;
  requestedModel?: unknown;
  requested_model?: unknown;
  requestedInferenceProvider?: unknown;
  requested_inference_provider?: unknown;
  requestedOptions?: Record<string, unknown>;
  requested_options?: Record<string, unknown>;
  requestId?: unknown;
  request_id?: unknown;
}, options?: { id?: unknown }): Record<string, unknown> | null;
export function buildNarsRuntimeExecutionPolicyReconfigureFrame(input?: {
  executionPolicy?: Record<string, unknown>;
  execution_policy?: Record<string, unknown>;
  maxRounds?: unknown;
  max_rounds?: unknown;
  requestId?: unknown;
  request_id?: unknown;
}, options?: { id?: unknown }): Record<string, unknown> | null;
export function buildNarsRuntimeIntelligenceReconfigureCancelFrame(input?: {
  targetRequestId?: unknown;
  target_request_id?: unknown;
  requestId?: unknown;
  request_id?: unknown;
}, options?: { id?: unknown }): Record<string, unknown> | null;
