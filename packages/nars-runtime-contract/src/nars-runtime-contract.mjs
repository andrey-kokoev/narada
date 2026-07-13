export const NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD = 'runtime.intelligence.reconfigure';

export const NARS_RUNTIME_SERVER_METHOD_LIST = Object.freeze([
  NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD,
]);

export const NARS_RUNTIME_SERVER_METHODS = new Set(NARS_RUNTIME_SERVER_METHOD_LIST);

export function isNarsRuntimeServerMethod(method) {
  return NARS_RUNTIME_SERVER_METHODS.has(method);
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
