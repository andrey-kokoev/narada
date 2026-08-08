import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_RUNTIME_PROFILE,
  RUNTIME_IMPLEMENTATION_MATRIX_CONTRACT_SCHEMA,
  runtimeProfileImplementationMatrix,
  resolveRuntimeProfileSelection,
} from './runtime-profile-selection.js';

export const RUNTIME_MATERIALIZATION_PLAN_SCHEMA = 'narada.runtime_materialization_plan.v1' as const;

type JsonRecord = Record<string, any>;

const RUNTIME_IMPLEMENTATION_MATRIX_URL = new URL('../contracts/runtime-implementation-matrix.json', import.meta.url);

export function runtimeImplementationMatrixContractPath(): string {
  return fileURLToPath(RUNTIME_IMPLEMENTATION_MATRIX_URL);
}

export function runtimeImplementationMatrixFingerprint(path = runtimeImplementationMatrixContractPath()): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function runtimeMaterializationPlanFingerprint(plan: JsonRecord): string {
  return createHash('sha256').update(JSON.stringify(plan), 'utf8').digest('hex');
}

/**
 * Resolve the matrix into a carrier-neutral JSON plan.  The plan contains no
 * process paths or carrier syntax; a materializer compiles its entries into
 * its own launch format.
 */
export function resolveRuntimeMaterializationPlan(runtimeProfile: any = DEFAULT_RUNTIME_PROFILE): JsonRecord {
  const selection = resolveRuntimeProfileSelection({ value: runtimeProfile, applicable: true });
  if (selection.status !== 'accepted') {
    return {
      schema: RUNTIME_MATERIALIZATION_PLAN_SCHEMA,
      status: 'refused',
      ...selection,
    };
  }
  const plan = {
    schema: RUNTIME_MATERIALIZATION_PLAN_SCHEMA,
    status: 'accepted',
    runtime_profile_kind: selection.runtime_profile_kind,
    runtime_engine_kind: selection.runtime_engine_kind,
    source: {
      matrix_schema: RUNTIME_IMPLEMENTATION_MATRIX_CONTRACT_SCHEMA,
      authority: 'narada.runtime_implementation_matrix',
      matrix_fingerprint: runtimeImplementationMatrixFingerprint(),
    },
    entries: runtimeProfileImplementationMatrix(selection.runtime_profile_kind),
  };
  return {
    ...plan,
    plan_fingerprint: runtimeMaterializationPlanFingerprint(plan),
  };
}

export function runtimeMaterializationPlanEntry(plan: JsonRecord, componentKind: string): JsonRecord | null {
  const entries = Array.isArray(plan.entries) ? plan.entries : [];
  const entry = entries.find((candidate: any) => candidate?.component_kind === componentKind);
  return entry && typeof entry === 'object' && !Array.isArray(entry) ? { ...entry } : null;
}