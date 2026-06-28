export const AGENT_CLI_CARRIER_KIND = 'agent-cli';
export const NARADA_AGENT_RUNTIME_SERVER_KIND = 'narada-agent-runtime-server';
export const NARADA_AGENT_RUNTIME_SERVER_ALIAS = 'nars';

export const ADMITTED_CARRIER_KINDS = Object.freeze([
  AGENT_CLI_CARRIER_KIND,
  'agent-tui',
  'codex',
  'kimi',
  'pi',
  'claude-code',
  'opencode',
]);

export const ADMITTED_OPERATOR_SURFACE_KINDS = ADMITTED_CARRIER_KINDS;

export function defaultRuntimeForCarrier(carrierKind) {
  return carrierKind === AGENT_CLI_CARRIER_KIND ? NARADA_AGENT_RUNTIME_SERVER_KIND : carrierKind;
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
  admittedCarrierKinds = ADMITTED_CARRIER_KINDS,
  reasonCode = 'carrier_kind_unsupported',
  reason = 'carrier_kind is not admitted by narada.carrier_kind.v1',
} = {}) {
  return {
    schema: 'narada.carrier_kind.v1',
    status: 'refused',
    reason_code: reasonCode,
    candidate_carrier_kind: String(candidate ?? ''),
    admitted_carrier_kinds: [...admittedCarrierKinds],
    reason,
    required_next_step: 'Use --carrier for operator/client carrier selection and --runtime for runtime implementation selection.',
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

export function resolveCarrierRuntimeSelection({
  carrierValue,
  operatorSurfaceValue,
  runtimeValue,
  admittedRuntimeSubstrateKinds,
  runtimeContractSchema,
  admittedCarrierKinds = ADMITTED_CARRIER_KINDS,
  admittedOperatorSurfaceKinds = ADMITTED_OPERATOR_SURFACE_KINDS,
} = {}) {
  const explicitCarrier = typeof carrierValue === 'string' && carrierValue.trim() ? carrierValue.trim() : null;
  const explicitOperatorSurface = typeof operatorSurfaceValue === 'string' && operatorSurfaceValue.trim() ? operatorSurfaceValue.trim() : null;
  const explicitRuntimeInput = typeof runtimeValue === 'string' && runtimeValue.trim() ? runtimeValue.trim() : null;
  const explicitRuntime = explicitRuntimeInput ? normalizeRuntimeAlias(explicitRuntimeInput) : null;
  if (explicitCarrier && explicitOperatorSurface && explicitCarrier !== explicitOperatorSurface) {
    return operatorSurfaceRefusal(explicitOperatorSurface, {
      admittedOperatorSurfaceKinds,
      reasonCode: 'carrier_operator_surface_conflict',
      reason: 'Legacy carrier_kind and operator_surface_kind must agree during the compatibility migration.',
    });
  }
  if (explicitRuntime === AGENT_CLI_CARRIER_KIND) {
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

  const operatorSurfaceKind = explicitOperatorSurface ?? explicitCarrier ?? (explicitRuntime && explicitRuntime !== NARADA_AGENT_RUNTIME_SERVER_KIND ? explicitRuntime : AGENT_CLI_CARRIER_KIND);
  if (!admittedOperatorSurfaceKinds.includes(operatorSurfaceKind)) {
    return operatorSurfaceRefusal(operatorSurfaceKind, { admittedOperatorSurfaceKinds });
  }

  const carrierKind = operatorSurfaceKind;
  if (!admittedCarrierKinds.includes(carrierKind)) return carrierRefusal(carrierKind, { admittedCarrierKinds });

  const runtimeKind = explicitRuntime ?? defaultRuntimeForCarrier(operatorSurfaceKind);
  const runtimeResolution = normalizeRuntimeSubstrateKind(runtimeKind, { admittedRuntimeSubstrateKinds, runtimeContractSchema });
  if (runtimeResolution.status === 'refused') return runtimeResolution;

  if (operatorSurfaceKind === AGENT_CLI_CARRIER_KIND && runtimeKind !== NARADA_AGENT_RUNTIME_SERVER_KIND) {
    return operatorSurfaceRefusal(operatorSurfaceKind, {
      admittedOperatorSurfaceKinds,
      reasonCode: 'operator_surface_runtime_mismatch',
      reason: 'The agent-cli operator surface must attach to the narada-agent-runtime-server runtime host.',
    });
  }
  if (operatorSurfaceKind !== AGENT_CLI_CARRIER_KIND && runtimeKind === NARADA_AGENT_RUNTIME_SERVER_KIND) {
    return operatorSurfaceRefusal(operatorSurfaceKind, {
      admittedOperatorSurfaceKinds,
      reasonCode: 'operator_surface_runtime_mismatch',
      reason: 'narada-agent-runtime-server requires the agent-cli operator surface projection.',
    });
  }

  return {
    schema: 'narada.carrier_runtime_selection.v1',
    status: 'accepted',
    operator_surface_kind: operatorSurfaceKind,
    runtime_host_kind: runtimeKind,
    carrier_kind: carrierKind,
    runtime_substrate_kind: runtimeKind,
    runtime_contract_schema: runtimeContractSchema,
    operator_surface_source_field: explicitOperatorSurface ? 'operator_surface' : explicitCarrier ? 'carrier' : 'derived',
    carrier_source_field: explicitCarrier ? 'carrier' : explicitOperatorSurface ? 'operator_surface' : 'derived',
    runtime_source_field: explicitRuntime ? 'runtime' : 'derived',
  };
}
