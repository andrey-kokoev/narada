type JsonRecord = Record<string, any>;

interface RuntimeExecutionPolicy extends JsonRecord {
  schema?: string;
  scope?: string;
  source?: JsonRecord;
  tool_loop?: JsonRecord;
}

function resourceRef(value: unknown, kind: string, prefix: string): JsonRecord | null {
  if (value === undefined || value === null) return null;
  const raw = typeof value === 'string' ? value.trim() : value;
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as JsonRecord : null;
  const id = typeof raw === 'string' ? raw : typeof record?.id === 'string' ? record.id.trim() : '';
  const actualKind = record?.kind;
  if (!id || (actualKind !== undefined && actualKind !== kind)) return null;
  return { kind, id: id.startsWith(prefix) ? id : `${prefix}${id}` };
}

interface RuntimeExecutionPolicyInput extends JsonRecord {
  executionPolicy?: RuntimeExecutionPolicy;
  execution_policy?: RuntimeExecutionPolicy;
  maxRounds?: unknown;
  max_rounds?: unknown;
  requestId?: unknown;
  request_id?: unknown;
}

interface RuntimeIntelligenceInput extends JsonRecord {
  provider?: unknown;
  model?: unknown;
  thinking?: unknown;
  inferenceProvider?: unknown;
  inference_provider?: unknown;
  requestedModel?: unknown;
  requested_model?: unknown;
  requestedInferenceProvider?: unknown;
  requested_inference_provider?: unknown;
  requestedOptions?: unknown;
  requested_options?: unknown;
  requestId?: unknown;
  request_id?: unknown;
}

const NARS_RUNTIME_EXECUTION_POLICY_SCHEMA = 'narada.nars.execution_policy.v1';
const NARS_RUNTIME_EXECUTION_POLICY_MIN_MAX_ROUNDS = 1;
const NARS_RUNTIME_EXECUTION_POLICY_MAX_MAX_ROUNDS = 500;

export const NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD = 'runtime.intelligence.reconfigure' as const;
export const NARS_RUNTIME_EXECUTION_POLICY_RECONFIGURE_METHOD = 'runtime.execution_policy.reconfigure' as const;

export const NARS_RUNTIME_SERVER_METHOD_LIST = Object.freeze([
  NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD,
  NARS_RUNTIME_EXECUTION_POLICY_RECONFIGURE_METHOD,
] as const);

export const NARS_RUNTIME_SERVER_METHODS = new Set<string>(NARS_RUNTIME_SERVER_METHOD_LIST);

export function isNarsRuntimeServerMethod(method: unknown): boolean {
  return typeof method === 'string' && NARS_RUNTIME_SERVER_METHODS.has(method);
}

export function buildNarsRuntimeExecutionPolicyReconfigureFrame(
  {
    executionPolicy,
    execution_policy,
    maxRounds,
    max_rounds,
    requestId,
    request_id,
  }: RuntimeExecutionPolicyInput = {},
  options: { id?: unknown } = {},
): JsonRecord | null {
  const candidate = executionPolicy ?? execution_policy ?? null;
  const requestedMaxRounds = maxRounds ?? max_rounds;
  const policy: RuntimeExecutionPolicy | null = candidate ?? (requestedMaxRounds == null ? null : {
    schema: NARS_RUNTIME_EXECUTION_POLICY_SCHEMA,
    scope: 'session',
    source: { kind: 'runtime-control', ref: null, revision: 1 },
    tool_loop: { max_rounds: requestedMaxRounds },
  });
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return null;
  const normalizedMaxRounds = Number(policy.tool_loop?.max_rounds);
  if (policy.schema !== NARS_RUNTIME_EXECUTION_POLICY_SCHEMA
    || !Number.isInteger(normalizedMaxRounds)
    || normalizedMaxRounds < NARS_RUNTIME_EXECUTION_POLICY_MIN_MAX_ROUNDS
    || normalizedMaxRounds > NARS_RUNTIME_EXECUTION_POLICY_MAX_MAX_ROUNDS) return null;
  const id = String(options.id ?? request_id ?? requestId ?? `nars-runtime-execution-policy-reconfigure-${Date.now()}`).trim();
  if (!id) return null;
  return {
    id,
    method: NARS_RUNTIME_EXECUTION_POLICY_RECONFIGURE_METHOD,
    params: {
      request_id: id,
      execution_policy: policy,
    },
  };
}

export function buildNarsRuntimeIntelligenceReconfigureFrame(
  {
    provider,
    model,
    thinking,
    inferenceProvider,
    inference_provider,
    requestedModel,
    requested_model,
    requestedInferenceProvider,
    requested_inference_provider,
    requestedOptions,
    requested_options,
    requestId,
    request_id,
  }: RuntimeIntelligenceInput = {},
  options: { id?: unknown } = {},
): JsonRecord | null {
  // Provider-only and legacy provider fields have no admitted representation
  // at the runtime boundary. The explicit inference-provider/model pair is
  // the smallest complete qualified selection and is admitted atomically.
  if (provider !== undefined && provider !== null) return null;
  if (thinking !== undefined && thinking !== null) return null;

  const modelValue = requested_model ?? requestedModel ?? model;
  const providerValue = requested_inference_provider
    ?? requestedInferenceProvider
    ?? inference_provider
    ?? inferenceProvider;
  const requestedModelRef = resourceRef(modelValue, 'model', 'model:');
  const requestedInferenceProviderRef = resourceRef(providerValue, 'inference-provider', 'inference-provider:');
  if (!requestedModelRef || !requestedInferenceProviderRef) return null;

  const optionsValue = requested_options ?? requestedOptions;
  const params: JsonRecord = {};
  const normalizedOptions: JsonRecord = optionsValue === undefined || optionsValue === null
    ? {}
    : optionsValue && typeof optionsValue === 'object' && !Array.isArray(optionsValue)
      ? { ...optionsValue }
      : {};
  if (optionsValue !== undefined && optionsValue !== null
    && (!optionsValue || typeof optionsValue !== 'object' || Array.isArray(optionsValue))) return null;
  params.requested_inference_provider = requestedInferenceProviderRef;
  params.requested_model = requestedModelRef;
  params.requested_options = normalizedOptions;

  const id = String(options.id ?? request_id ?? requestId ?? `nars-runtime-intelligence-reconfigure-${Date.now()}`).trim();
  if (!id) return null;
  return {
    id,
    method: NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD,
    params: {
      request_id: id,
      ...params,
    },
  };
}

export type {
  JsonRecord,
  RuntimeExecutionPolicy,
  RuntimeExecutionPolicyInput,
  RuntimeIntelligenceInput,
};
