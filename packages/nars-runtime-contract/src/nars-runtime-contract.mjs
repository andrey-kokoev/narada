const NARS_RUNTIME_EXECUTION_POLICY_SCHEMA = 'narada.nars.execution_policy.v1';
const NARS_RUNTIME_EXECUTION_POLICY_MIN_MAX_ROUNDS = 1;
const NARS_RUNTIME_EXECUTION_POLICY_MAX_MAX_ROUNDS = 500;

export const NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD = 'runtime.intelligence.reconfigure';
export const NARS_RUNTIME_EXECUTION_POLICY_RECONFIGURE_METHOD = 'runtime.execution_policy.reconfigure';

export const NARS_RUNTIME_SERVER_METHOD_LIST = Object.freeze([
  NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD,
  NARS_RUNTIME_EXECUTION_POLICY_RECONFIGURE_METHOD,
]);

export const NARS_RUNTIME_SERVER_METHODS = new Set(NARS_RUNTIME_SERVER_METHOD_LIST);

export function isNarsRuntimeServerMethod(method) {
  return NARS_RUNTIME_SERVER_METHODS.has(method);
}

export function buildNarsRuntimeExecutionPolicyReconfigureFrame({
  executionPolicy,
  execution_policy,
  maxRounds,
  max_rounds,
  requestId,
  request_id,
} = {}, options = {}) {
  const candidate = executionPolicy ?? execution_policy ?? null;
  const requestedMaxRounds = maxRounds ?? max_rounds;
  const policy = candidate ?? (requestedMaxRounds == null ? null : {
    schema: NARS_RUNTIME_EXECUTION_POLICY_SCHEMA,
    scope: 'session',
    source: { kind: 'runtime-control', ref: null, revision: 1 },
    tool_loop: { max_rounds: requestedMaxRounds },
  });
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return null;
  const normalizedMaxRounds = Number(policy?.tool_loop?.max_rounds);
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

export function buildNarsRuntimeIntelligenceReconfigureFrame({
  provider,
  model,
  thinking,
  requestId,
  request_id,
} = {}, options = {}) {
  const values = { provider, model, thinking };
  const params = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' || !value.trim()) return null;
    params[key] = value.trim();
  }
  if (!Object.keys(params).length) return null;

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
