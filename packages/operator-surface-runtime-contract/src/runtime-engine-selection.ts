import { loadRuntimeEnginesContract } from './operator-surface-runtime-contract.js';

type JsonRecord = Record<string, any>;

const contract = loadRuntimeEnginesContract();
const admittedRuntimeEngines = Array.isArray(contract.admitted_runtime_engines)
  ? contract.admitted_runtime_engines.filter((value: any) => typeof value === 'string' && value.trim())
  : [];
const defaultRuntimeEngine = typeof contract.default_runtime_engine === 'string'
  ? contract.default_runtime_engine
  : 'node';

if (
  contract.schema !== 'narada.runtime_engine.v1'
  || admittedRuntimeEngines.length === 0
  || !admittedRuntimeEngines.includes(defaultRuntimeEngine)
) {
  throw new Error('runtime_engine_contract_invalid');
}

export const RUNTIME_ENGINE_CONTRACT_SCHEMA = contract.schema;
export const ADMITTED_RUNTIME_ENGINES = Object.freeze([...admittedRuntimeEngines]);
export const DEFAULT_RUNTIME_ENGINE = defaultRuntimeEngine;

export function runtimeEngineProfile(runtimeEngine: any): JsonRecord | null {
  const profile = contract.engine_profiles?.[String(runtimeEngine ?? '')];
  return profile && typeof profile === 'object' && !Array.isArray(profile) ? { ...profile } : null;
}

export function normalizeRuntimeEngine(value: any): string {
  return String(value ?? '').trim().toLowerCase();
}

export function runtimeEngineRefusal(candidate: any, {
  reasonCode = 'runtime_engine_unsupported',
  reason = 'runtime_engine is not admitted by narada.runtime_engine.v1',
  requiredNextStep = 'Use --runtime-engine node, --runtime-engine bun, or --runtime-engine rust.',
}: JsonRecord = {}): JsonRecord {
  return {
    schema: RUNTIME_ENGINE_CONTRACT_SCHEMA,
    status: 'refused',
    reason_code: reasonCode,
    candidate_runtime_engine: String(candidate ?? ''),
    admitted_runtime_engines: [...ADMITTED_RUNTIME_ENGINES],
    reason,
    required_next_step: requiredNextStep,
  };
}

export function resolveRuntimeEngineSelection({
  value = null,
  environmentValue = null,
  applicable = true,
  defaultEngine = DEFAULT_RUNTIME_ENGINE,
}: JsonRecord = {}): JsonRecord {
  const explicitValue = typeof value === 'string' && value.trim() ? value : null;
  const environmentEngine = typeof environmentValue === 'string' && environmentValue.trim() ? environmentValue : null;
  const candidate = normalizeRuntimeEngine(explicitValue ?? environmentEngine ?? defaultEngine);
  if (!ADMITTED_RUNTIME_ENGINES.includes(candidate)) {
    return runtimeEngineRefusal(candidate);
  }
  if (!applicable && (explicitValue || environmentEngine)) {
    return runtimeEngineRefusal(candidate, {
      reasonCode: 'runtime_engine_surface_unsupported',
      reason: 'runtime_engine selection applies to NARS runtime hosts, not independent carrier runtimes.',
      requiredNextStep: 'Select a NARS runtime host before selecting --runtime-engine.',
    });
  }
  return {
    schema: RUNTIME_ENGINE_CONTRACT_SCHEMA,
    status: 'accepted',
    runtime_engine_kind: candidate,
    runtime_engine_profile: runtimeEngineProfile(candidate),
    source_field: explicitValue ? 'runtime_engine' : environmentEngine ? 'environment' : 'default',
    default_runtime_engine: defaultEngine,
    applicable,
  };
}
