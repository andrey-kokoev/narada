import { loadOperatorSurfaceLaunchMatrixContract, loadRuntimeSubstrateKindsContract } from './operator-surface-runtime-contract.mjs';
import {
  INTELLIGENCE_KERNEL_KINDS,
  normalizeIntelligenceKernelKind,
} from '@narada2/nars-intelligence-kernel-contract';

export const AGENT_CLI_OPERATOR_SURFACE_KIND = 'agent-cli';
export const NARADA_AGENT_RUNTIME_SERVER_KIND = 'narada-agent-runtime-server';
export const NARADA_AGENT_RUNTIME_SERVER_ALIAS = 'nars';
// The value is versioned persisted data; the exported identifier is canonical.
export const OPERATOR_SURFACE_LAUNCH_MATRIX_CONTRACT_SCHEMA = 'narada.carrier_launch_matrix.v3';

const carrierLaunchMatrix = loadOperatorSurfaceLaunchMatrixContract();
const runtimeSubstrateContract = loadRuntimeSubstrateKindsContract();
const admittedRuntimeSubstrateKindsFromContract = Array.isArray(runtimeSubstrateContract.admitted_runtime_substrate_kinds)
  ? runtimeSubstrateContract.admitted_runtime_substrate_kinds
  : [];
const rawCarrierLaunchMatrixRows = Array.isArray(carrierLaunchMatrix.rows) ? carrierLaunchMatrix.rows : [];
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const admittedConformanceEvidenceLevels = new Set([
  'code_enforced',
  'config_enforced',
  'startup_enforced',
  'documented_advisory',
  'unverified',
]);
const isCarrierConformanceProfile = (profile) => profile
  && typeof profile === 'object'
  && admittedConformanceEvidenceLevels.has(profile.evidence_level)
  && isNonEmptyString(profile.default_intelligence_auth_path)
  && isNonEmptyString(profile.mcp_fabric_source)
  && isNonEmptyString(profile.native_shell_posture)
  && isNonEmptyString(profile.mutating_call_handling)
  && isNonEmptyString(profile.startup_sequence_availability)
  && Array.isArray(profile.known_gaps)
  && profile.known_gaps.every((gap) => isNonEmptyString(gap));
const isCarrierLaunchMatrixRow = (row) => row
  && typeof row === 'object'
  && isNonEmptyString(row.launch_selection_kind)
  && isNonEmptyString(row.operator_surface_kind)
  && isNonEmptyString(row.carrier_implementation_kind)
  && isNonEmptyString(row.runtime_host_kind)
  && isNonEmptyString(row.runtime_substrate_kind)
  && isNonEmptyString(row.tool_fabric_adapter_kind)
  && isNonEmptyString(row.tool_fabric_source)
  && (row.adapter_entrypoint === null || isNonEmptyString(row.adapter_entrypoint))
  && Array.isArray(row.projection_capabilities)
  && row.projection_capabilities.every((capability) => isNonEmptyString(capability))
  && new Set(row.projection_capabilities).size === row.projection_capabilities.length
  && isCarrierConformanceProfile(row.conformance)
  && Array.isArray(row.expected_tools)
  && row.expected_tools.every((tool) => isNonEmptyString(tool))
  && (row.expected_tools_scope === 'sentinel' || row.expected_tools_scope === 'none')
  && (row.expected_tools_scope === 'sentinel' ? row.expected_tools.length > 0 : row.expected_tools.length === 0)
  && (row.expected_tools_scope !== 'none'
    || (row.adapter_entrypoint === null
      && Array.isArray(row.states)
      && row.states.includes('no_narada_mcp_claim')))
  && Array.isArray(row.states)
  && row.states.length > 0
  && row.states.every((state) => isNonEmptyString(state))
  && (row.admission_basis === undefined || isNonEmptyString(row.admission_basis))
  && (row.intelligence_kernel_kinds === undefined
    || (Array.isArray(row.intelligence_kernel_kinds)
      && row.intelligence_kernel_kinds.length > 0
      && row.intelligence_kernel_kinds.every((kind) => INTELLIGENCE_KERNEL_KINDS.includes(kind))));
if (
  carrierLaunchMatrix.schema !== OPERATOR_SURFACE_LAUNCH_MATRIX_CONTRACT_SCHEMA
  || runtimeSubstrateContract.schema !== 'narada.runtime_substrate_kind.v1'
  || admittedRuntimeSubstrateKindsFromContract.length === 0
  || rawCarrierLaunchMatrixRows.length === 0
  || rawCarrierLaunchMatrixRows.some((row) => !isCarrierLaunchMatrixRow(row))
  || rawCarrierLaunchMatrixRows.some((row) => !admittedRuntimeSubstrateKindsFromContract.includes(row.runtime_substrate_kind))
  || rawCarrierLaunchMatrixRows.some((row) => !admittedRuntimeSubstrateKindsFromContract.includes(row.runtime_host_kind))
) {
  throw new Error('carrier_launch_matrix_contract_invalid');
}

const carrierLaunchMatrixRows = Object.freeze(rawCarrierLaunchMatrixRows.map((row) => Object.freeze({
  ...row,
  conformance: Object.freeze({
    ...row.conformance,
    known_gaps: Object.freeze([...row.conformance.known_gaps]),
  }),
  projection_capabilities: Object.freeze([...row.projection_capabilities]),
  expected_tools: Object.freeze([...row.expected_tools]),
  states: Object.freeze([...row.states]),
  ...(Array.isArray(row.intelligence_kernel_kinds)
    ? { intelligence_kernel_kinds: Object.freeze([...row.intelligence_kernel_kinds]) }
    : {}),
})));
const carrierLaunchMatrixByLaunchSelection = new Map(carrierLaunchMatrixRows.map((row) => [row.launch_selection_kind, row]));
const carrierLaunchMatrixByOperatorSurface = new Map(carrierLaunchMatrixRows.map((row) => [row.operator_surface_kind, row]));
const carrierLaunchMatrixByProjectionCapability = new Map();
for (const row of carrierLaunchMatrixRows) {
  for (const capability of row.projection_capabilities) {
    const rows = carrierLaunchMatrixByProjectionCapability.get(capability) ?? [];
    rows.push(row);
    carrierLaunchMatrixByProjectionCapability.set(capability, rows);
  }
}
for (const rows of carrierLaunchMatrixByProjectionCapability.values()) Object.freeze(rows);
if (
  carrierLaunchMatrixByLaunchSelection.size !== carrierLaunchMatrixRows.length
  || carrierLaunchMatrixByOperatorSurface.size !== carrierLaunchMatrixRows.length
) {
  throw new Error('carrier_launch_matrix_contract_invalid');
}

export const ADMITTED_LAUNCH_SELECTION_KINDS = Object.freeze(carrierLaunchMatrixRows.map((row) => row.launch_selection_kind));
// Compatibility name: existing --carrier callers pass the launch selector.
export const ADMITTED_RUNTIME_SUBSTRATE_KINDS = Object.freeze([...admittedRuntimeSubstrateKindsFromContract]);
export const ADMITTED_OPERATOR_SURFACE_KINDS = Object.freeze(carrierLaunchMatrixRows.map((row) => row.operator_surface_kind));
export const ADMITTED_RUNTIME_IMPLEMENTATION_KINDS = Object.freeze([
  ...new Set(carrierLaunchMatrixRows.map((row) => row.carrier_implementation_kind)),
]);
export const ADMITTED_TOOL_FABRIC_ADAPTER_KINDS = Object.freeze([
  ...new Set(carrierLaunchMatrixRows.map((row) => row.tool_fabric_adapter_kind)),
]);
export { INTELLIGENCE_KERNEL_KINDS };
export const OPERATOR_SURFACE_RUNTIME_SELECTION_SCHEMA = 'narada.operator_surface_runtime_selection.v1';
export const LEGACY_CARRIER_RUNTIME_SELECTION_SCHEMA = 'narada.carrier_runtime_selection.v1';
export const OPERATOR_SURFACE_RUNTIME_COMPATIBILITY_SCHEMA = 'narada.operator_surface_runtime_compatibility.v1';
export const CARRIER_COMPATIBILITY_POLICY = Object.freeze({
  schema: OPERATOR_SURFACE_RUNTIME_COMPATIBILITY_SCHEMA,
  status: 'transitional',
  canonical_selection_field: 'operator_surface',
  canonical_runtime_field: 'runtime',
  legacy_selection_field: 'carrier',
  retirement: 'Remove the carrier alias after registered launchers and consumers emit operator_surface explicitly.',
});

export function operatorSurfaceLaunchMatrixRow(launchSelectionKind) {
  return carrierLaunchMatrixByLaunchSelection.get(String(launchSelectionKind ?? '')) ?? null;
}

export function operatorSurfaceKindsForRuntimeHost(runtimeHostKind) {
  return Object.freeze(carrierLaunchMatrixRows
    .filter((row) => row.runtime_host_kind === runtimeHostKind)
    .map((row) => row.operator_surface_kind));
}

export function operatorSurfaceKindsForProjectionCapability(capability) {
  return Object.freeze((carrierLaunchMatrixByProjectionCapability.get(String(capability ?? '')) ?? [])
    .map((row) => row.operator_surface_kind));
}

export function defaultRuntimeForOperatorSurface(launchSelectionKind) {
  const matrixRow = operatorSurfaceLaunchMatrixRow(launchSelectionKind);
  if (!matrixRow) throw new Error('carrier_launch_matrix_row_missing:' + launchSelectionKind);
  return matrixRow.runtime_substrate_kind;
}

export function operatorSurfaceRefusal(candidate, {
  admittedOperatorSurfaceKinds = ADMITTED_OPERATOR_SURFACE_KINDS,
  reasonCode = 'operator_surface_kind_unsupported',
  reason = 'operator_surface_kind is not admitted by narada.operator_surface_kind.v1',
} = {}) {
  return {
    schema: 'narada.operator_surface_kind.v1',
    status: 'refused',
    reason_code: reasonCode,
    candidate_operator_surface_kind: String(candidate ?? ''),
    admitted_operator_surface_kinds: [...admittedOperatorSurfaceKinds],
    reason,
    required_next_step: 'Use --operator-surface for operator/client projection selection and --runtime for runtime host selection.',
  };
}

export function normalizeRuntimeAlias(value) {
  const runtimeName = String(value ?? '').trim();
  return runtimeName === NARADA_AGENT_RUNTIME_SERVER_ALIAS ? NARADA_AGENT_RUNTIME_SERVER_KIND : runtimeName;
}

export function carrierRefusal(candidate, {
  admittedCarrierKinds = ADMITTED_LAUNCH_SELECTION_KINDS,
  reasonCode = 'carrier_kind_unsupported',
  reason = `launch_selection_kind is not admitted by ${OPERATOR_SURFACE_LAUNCH_MATRIX_CONTRACT_SCHEMA}`,
} = {}) {
  return {
    schema: 'narada.carrier_kind.v1',
    status: 'refused',
    reason_code: reasonCode,
    candidate_carrier_kind: String(candidate ?? ''),
    candidate_launch_selection_kind: String(candidate ?? ''),
    admitted_carrier_kinds: [...admittedCarrierKinds],
    reason,
    required_next_step: 'Use --operator-surface for operator/client selection and --runtime for runtime implementation selection; --carrier is a compatibility alias.',
  };
}

export function runtimeRefusal(candidate, {
  admittedRuntimeSubstrateKinds,
  runtimeContractSchema,
  reasonCode = 'runtime_substrate_kind_unsupported',
  reason = 'runtime_substrate_kind is not admitted by narada.runtime_substrate_kind.v1',
  requiredNextStep = 'Admit the new runtime in a later contract version before startup or materialization accepts it.',
} = {}) {
  return {
    schema: runtimeContractSchema,
    status: 'refused',
    reason_code: reasonCode,
    candidate_runtime_substrate_kind: String(candidate ?? ''),
    admitted_runtime_substrate_kinds: [...(admittedRuntimeSubstrateKinds ?? [])],
    reason,
    required_next_step: requiredNextStep,
  };
}

export function normalizeRuntimeSubstrateKind(value, {
  admittedRuntimeSubstrateKinds,
  runtimeContractSchema,
} = {}) {
  const runtimeName = normalizeRuntimeAlias(value);
  if ((admittedRuntimeSubstrateKinds ?? []).includes(runtimeName)) {
    return {
      runtime_substrate_kind: runtimeName,
      runtime_contract_schema: runtimeContractSchema,
      source_field: 'runtime',
      legacy_runtime: runtimeName,
    };
  }
  return runtimeRefusal(runtimeName, { admittedRuntimeSubstrateKinds, runtimeContractSchema });
}

export function resolveOperatorSurfaceRuntimeSelection({
  carrierValue,
  operatorSurfaceValue,
  runtimeValue,
  admittedRuntimeSubstrateKinds = ADMITTED_RUNTIME_SUBSTRATE_KINDS,
  runtimeContractSchema = runtimeSubstrateContract.schema,
  admittedCarrierKinds = ADMITTED_LAUNCH_SELECTION_KINDS,
  admittedOperatorSurfaceKinds = ADMITTED_OPERATOR_SURFACE_KINDS,
  intelligenceKernelValue,
} = {}) {
  const explicitCarrier = typeof carrierValue === 'string' && carrierValue.trim() ? carrierValue.trim() : null;
  const explicitOperatorSurface = typeof operatorSurfaceValue === 'string' && operatorSurfaceValue.trim() ? operatorSurfaceValue.trim() : null;
  const explicitRuntimeInput = typeof runtimeValue === 'string' && runtimeValue.trim() ? runtimeValue.trim() : null;
  const explicitRuntime = explicitRuntimeInput ? normalizeRuntimeAlias(explicitRuntimeInput) : null;
  if (explicitRuntime === AGENT_CLI_OPERATOR_SURFACE_KIND) {
    return runtimeRefusal(explicitRuntime, {
      admittedRuntimeSubstrateKinds,
      runtimeContractSchema,
      reasonCode: 'runtime_carrier_conflation_refused',
      reason: 'agent-cli is an operator surface, not a runtime host. Select it with --operator-surface agent-cli and use --runtime narada-agent-runtime-server.',
      requiredNextStep: 'Use --operator-surface agent-cli --runtime narada-agent-runtime-server.',
    });
  }

  if (explicitRuntime && !(admittedRuntimeSubstrateKinds ?? []).includes(explicitRuntime)) {
    return runtimeRefusal(explicitRuntime, { admittedRuntimeSubstrateKinds, runtimeContractSchema });
  }

  const operatorSurfaceKind = explicitOperatorSurface ?? explicitCarrier ?? (explicitRuntime && explicitRuntime !== NARADA_AGENT_RUNTIME_SERVER_KIND ? explicitRuntime : AGENT_CLI_OPERATOR_SURFACE_KIND);
  if (!admittedOperatorSurfaceKinds.includes(operatorSurfaceKind)) {
    return operatorSurfaceRefusal(operatorSurfaceKind, { admittedOperatorSurfaceKinds });
  }

  const matrixRow = explicitOperatorSurface
    ? carrierLaunchMatrixByOperatorSurface.get(operatorSurfaceKind)
    : carrierLaunchMatrixByLaunchSelection.get(operatorSurfaceKind);
  if (!matrixRow) return carrierRefusal(operatorSurfaceKind, { admittedCarrierKinds });

  const launchSelectionKind = matrixRow.launch_selection_kind;
  const carrierKind = launchSelectionKind;
  if (!admittedCarrierKinds.includes(carrierKind)) return carrierRefusal(carrierKind, { admittedCarrierKinds });

  const runtimeKind = explicitRuntime ?? matrixRow.runtime_substrate_kind;
  const runtimeResolution = normalizeRuntimeSubstrateKind(runtimeKind, { admittedRuntimeSubstrateKinds, runtimeContractSchema });
  if (runtimeResolution.status === 'refused') return runtimeResolution;

  if (runtimeKind !== matrixRow.runtime_substrate_kind) {
    return operatorSurfaceRefusal(operatorSurfaceKind, {
      admittedOperatorSurfaceKinds,
      reasonCode: 'operator_surface_runtime_mismatch',
      reason: `${operatorSurfaceKind} requires runtime substrate ${matrixRow.runtime_substrate_kind}.`,
    });
  }

  const explicitKernel = typeof intelligenceKernelValue === 'string' && intelligenceKernelValue.trim()
    ? intelligenceKernelValue.trim()
    : null;
  const kernelKinds = matrixRow.intelligence_kernel_kinds ?? null;
  let intelligenceKernelKind = null;
  if (kernelKinds) {
    try {
      intelligenceKernelKind = normalizeIntelligenceKernelKind(explicitKernel);
    } catch {
      return operatorSurfaceRefusal(explicitKernel, {
        admittedOperatorSurfaceKinds,
        reasonCode: 'intelligence_kernel_kind_unsupported',
        reason: `intelligence kernel must be one of ${(kernelKinds ?? []).join(', ')} for ${operatorSurfaceKind}.`,
        requiredNextStep: 'Use --intelligence-kernel with an admitted NARS kernel kind.',
      });
    }
    if (!kernelKinds.includes(intelligenceKernelKind)) {
      return operatorSurfaceRefusal(intelligenceKernelKind, {
        admittedOperatorSurfaceKinds,
        reasonCode: 'intelligence_kernel_kind_unsupported',
        reason: `intelligence kernel '${intelligenceKernelKind}' is not admitted for ${operatorSurfaceKind}.`,
        requiredNextStep: 'Select an admitted intelligence kernel for the NARS runtime.',
      });
    }
  } else if (explicitKernel) {
    return operatorSurfaceRefusal(explicitKernel, {
      admittedOperatorSurfaceKinds,
      reasonCode: 'intelligence_kernel_carrier_conflation_refused',
      reason: 'The independent carrier surface does not select a NARS intelligence kernel.',
      requiredNextStep: 'Select a NARS operator surface before selecting intelligence_kernel_kind.',
    });
  }

  return {
    schema: OPERATOR_SURFACE_RUNTIME_SELECTION_SCHEMA,
    legacy_schema: LEGACY_CARRIER_RUNTIME_SELECTION_SCHEMA,
    status: 'accepted',
    launch_selection_kind: launchSelectionKind,
    operator_surface_kind: matrixRow.operator_surface_kind,
    runtime_host_kind: matrixRow.runtime_host_kind,
    launch_operator_surface_kind: matrixRow.operator_surface_kind,
    carrier_kind: carrierKind,
    carrier_implementation_kind: matrixRow.carrier_implementation_kind,
    runtime_substrate_kind: runtimeKind,
    runtime_contract_schema: runtimeContractSchema,
    compatibility: CARRIER_COMPATIBILITY_POLICY,
    operator_surface_source_field: explicitOperatorSurface ? 'operator_surface' : explicitCarrier ? 'carrier' : 'derived',
    carrier_source_field: explicitCarrier ? 'carrier' : explicitOperatorSurface ? 'operator_surface' : 'derived',
    runtime_source_field: explicitRuntime ? 'runtime' : 'derived',
    intelligence_kernel_kind: intelligenceKernelKind,
    intelligence_kernel_source_field: kernelKinds
      ? (explicitKernel ? 'intelligence_kernel' : 'derived')
      : 'not_applicable',
  };
}
