import {
  loadRuntimeImplementationMatrixContract,
  loadRuntimeProfilesContract,
} from './operator-surface-runtime-contract.js';

type JsonRecord = Record<string, any>;

const profilesContract = loadRuntimeProfilesContract();
const matrixContract = loadRuntimeImplementationMatrixContract();
const admittedRuntimeProfiles = Array.isArray(profilesContract.admitted_runtime_profiles)
  ? profilesContract.admitted_runtime_profiles.filter((value: any) => typeof value === 'string' && value.trim())
  : [];
const defaultRuntimeProfile = typeof profilesContract.default_runtime_profile === 'string'
  ? profilesContract.default_runtime_profile
  : 'native';
const admittedRuntimeEngines = Array.isArray(matrixContract.runtime_engine_kinds)
  ? matrixContract.runtime_engine_kinds.filter((value: any) => typeof value === 'string' && value.trim())
  : [];
const admittedImplementationStatuses = Array.isArray(matrixContract.implementation_statuses)
  ? matrixContract.implementation_statuses.filter((value: any) => typeof value === 'string' && value.trim())
  : [];
const matrixRows = Array.isArray(matrixContract.rows)
  ? matrixContract.rows.filter((value: any) => value && typeof value === 'object' && !Array.isArray(value))
  : [];

if (
  profilesContract.schema !== 'narada.runtime_profile.v1'
  || admittedRuntimeProfiles.length === 0
  || !admittedRuntimeProfiles.includes(defaultRuntimeProfile)
  || matrixContract.schema !== 'narada.runtime_implementation_matrix.v1'
  || admittedRuntimeEngines.length === 0
  || admittedImplementationStatuses.length === 0
  || matrixRows.length === 0
) {
  throw new Error('runtime_profile_contract_invalid');
}

for (const profile of admittedRuntimeProfiles) {
  const definition = profilesContract.profile_definitions?.[profile];
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new Error(`runtime_profile_definition_missing:${profile}`);
  }
  if (!admittedRuntimeEngines.includes(definition.runtime_engine_kind)) {
    throw new Error(`runtime_profile_engine_not_admitted:${profile}`);
  }
  if (definition.matrix_profile_kind !== profile) {
    throw new Error(`runtime_profile_matrix_kind_mismatch:${profile}`);
  }
  for (const row of matrixRows.filter((candidate: JsonRecord) => candidate.required === true)) {
    const selectedEngine = row.profile_runtime_engine_kinds?.[profile];
    const implementation = row.implementations?.[selectedEngine];
    if (!admittedRuntimeEngines.includes(selectedEngine) || !implementation || implementation.status !== 'admitted') {
      throw new Error(`runtime_profile_required_implementation_unavailable:${profile}:${row.component_kind}`);
    }
  }
}

export const RUNTIME_PROFILE_CONTRACT_SCHEMA = profilesContract.schema;
export const RUNTIME_IMPLEMENTATION_MATRIX_CONTRACT_SCHEMA = matrixContract.schema;
export const ADMITTED_RUNTIME_PROFILES = Object.freeze([...admittedRuntimeProfiles]);
export const DEFAULT_RUNTIME_PROFILE = defaultRuntimeProfile;

export function normalizeRuntimeProfile(value: any): string {
  return String(value ?? '').trim().toLowerCase();
}

export function runtimeProfileDefinition(runtimeProfile: any): JsonRecord | null {
  const profile = profilesContract.profile_definitions?.[String(runtimeProfile ?? '')];
  return profile && typeof profile === 'object' && !Array.isArray(profile) ? { ...profile } : null;
}

export function runtimeProfileForEngine(runtimeEngine: any): string | null {
  const candidate = String(runtimeEngine ?? '').trim().toLowerCase();
  const profile = admittedRuntimeProfiles.find((profileKind: string) => (
    profilesContract.profile_definitions?.[profileKind]?.runtime_engine_kind === candidate
  ));
  return profile ?? null;
}

export function runtimeProfileImplementationMatrix(runtimeProfile: any): JsonRecord[] {
  const profile = normalizeRuntimeProfile(runtimeProfile);
  return matrixRows.map((row: JsonRecord) => {
    const runtimeEngineKind = row.profile_runtime_engine_kinds?.[profile] ?? null;
    const implementation = runtimeEngineKind ? row.implementations?.[runtimeEngineKind] : null;
    return {
      component_kind: row.component_kind,
      package: row.package,
      required: row.required === true,
      runtime_engine_kind: runtimeEngineKind,
      implementation_status: implementation?.status ?? 'unavailable',
      evidence: Array.isArray(implementation?.evidence) ? [...implementation.evidence] : [],
    };
  });
}

export function runtimeProfileRefusal(candidate: any, {
  reasonCode = 'runtime_profile_unsupported',
  reason = 'runtime_profile is not admitted by narada.runtime_profile.v1',
  requiredNextStep = 'Use --runtime-profile native, --runtime-profile bun, or --runtime-profile node-compat.',
}: JsonRecord = {}): JsonRecord {
  return {
    schema: RUNTIME_PROFILE_CONTRACT_SCHEMA,
    status: 'refused',
    reason_code: reasonCode,
    candidate_runtime_profile: String(candidate ?? ''),
    admitted_runtime_profiles: [...ADMITTED_RUNTIME_PROFILES],
    reason,
    required_next_step: requiredNextStep,
  };
}

export function resolveRuntimeProfileSelection({
  value = null,
  environmentValue = null,
  runtimeEngineValue = null,
  runtimeEngineEnvironmentValue = null,
  applicable = true,
  defaultProfile = DEFAULT_RUNTIME_PROFILE,
}: JsonRecord = {}): JsonRecord {
  const explicitProfile = typeof value === 'string' && value.trim() ? normalizeRuntimeProfile(value) : null;
  const environmentProfile = typeof environmentValue === 'string' && environmentValue.trim() ? normalizeRuntimeProfile(environmentValue) : null;
  const explicitEngine = typeof runtimeEngineValue === 'string' && runtimeEngineValue.trim()
    ? String(runtimeEngineValue).trim().toLowerCase()
    : null;
  const environmentEngine = typeof runtimeEngineEnvironmentValue === 'string' && runtimeEngineEnvironmentValue.trim()
    ? String(runtimeEngineEnvironmentValue).trim().toLowerCase()
    : null;
  const compatibilityProfile = runtimeProfileForEngine(explicitEngine ?? environmentEngine);
  const candidate = explicitProfile ?? environmentProfile ?? compatibilityProfile ?? normalizeRuntimeProfile(defaultProfile);

  if (!applicable && (explicitProfile || environmentProfile || explicitEngine || environmentEngine)) {
    return runtimeProfileRefusal(candidate, {
      reasonCode: 'runtime_profile_surface_unsupported',
      reason: 'runtime_profile selection applies to NARS runtime hosts, not independent carrier runtimes.',
      requiredNextStep: 'Select a NARS runtime host before selecting --runtime-profile.',
    });
  }
  if (!ADMITTED_RUNTIME_PROFILES.includes(candidate)) {
    return runtimeProfileRefusal(candidate);
  }

  const definition = runtimeProfileDefinition(candidate) as JsonRecord;
  const selectedEngine = definition.runtime_engine_kind;
  const suppliedEngine = explicitEngine ?? environmentEngine;
  if (suppliedEngine && suppliedEngine !== selectedEngine) {
    return runtimeProfileRefusal(candidate, {
      reasonCode: 'runtime_profile_engine_conflict',
      reason: `runtime_profile ${candidate} requires runtime engine ${selectedEngine}, but ${suppliedEngine} was selected.`,
      requiredNextStep: `Use --runtime-profile ${candidate} without --runtime-engine, or select --runtime-engine ${selectedEngine}.`,
    });
  }

  return {
    schema: RUNTIME_PROFILE_CONTRACT_SCHEMA,
    status: 'accepted',
    runtime_profile_kind: candidate,
    runtime_profile_definition: definition,
    runtime_engine_kind: selectedEngine,
    runtime_implementation_matrix_schema: RUNTIME_IMPLEMENTATION_MATRIX_CONTRACT_SCHEMA,
    runtime_implementation_matrix: runtimeProfileImplementationMatrix(candidate),
    source_field: explicitProfile
      ? 'runtime_profile'
      : environmentProfile
        ? 'environment'
        : compatibilityProfile
          ? (explicitEngine ? 'runtime_engine' : 'runtime_engine_environment')
          : 'default',
    default_runtime_profile: defaultProfile,
    applicable,
  };
}
