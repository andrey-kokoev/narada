export const AGENT_CLI_CARRIER_KIND = 'agent-cli';
export const NARADA_AGENT_RUNTIME_SERVER_KIND = 'narada-agent-runtime-server';

export const ADMITTED_CARRIER_KINDS = Object.freeze([
  AGENT_CLI_CARRIER_KIND,
  'agent-tui',
  'codex',
  'kimi',
  'pi',
  'claude-code',
  'opencode',
]);

export function defaultRuntimeForCarrier(carrierKind) {
  return carrierKind === AGENT_CLI_CARRIER_KIND ? NARADA_AGENT_RUNTIME_SERVER_KIND : carrierKind;
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
  const runtimeName = String(value ?? '').trim();
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
  runtimeValue,
  admittedRuntimeSubstrateKinds,
  runtimeContractSchema,
  admittedCarrierKinds = ADMITTED_CARRIER_KINDS,
} = {}) {
  const explicitCarrier = typeof carrierValue === 'string' && carrierValue.trim() ? carrierValue.trim() : null;
  const explicitRuntime = typeof runtimeValue === 'string' && runtimeValue.trim() ? runtimeValue.trim() : null;
  if (explicitRuntime === AGENT_CLI_CARRIER_KIND) {
    return runtimeRefusal(explicitRuntime, {
      admittedRuntimeSubstrateKinds,
      runtimeContractSchema,
      reasonCode: 'runtime_carrier_conflation_refused',
      reason: 'agent-cli is an operator carrier, not a runtime. Select it with --carrier agent-cli and use --runtime narada-agent-runtime-server.',
      requiredNextStep: 'Use --carrier agent-cli --runtime narada-agent-runtime-server.',
    });
  }

  if (explicitRuntime && !(admittedRuntimeSubstrateKinds ?? []).includes(explicitRuntime)) {
    return runtimeRefusal(explicitRuntime, { admittedRuntimeSubstrateKinds, runtimeContractSchema });
  }

  const carrierKind = explicitCarrier ?? (explicitRuntime && explicitRuntime !== NARADA_AGENT_RUNTIME_SERVER_KIND ? explicitRuntime : AGENT_CLI_CARRIER_KIND);
  if (!admittedCarrierKinds.includes(carrierKind)) return carrierRefusal(carrierKind, { admittedCarrierKinds });

  const runtimeKind = explicitRuntime ?? defaultRuntimeForCarrier(carrierKind);
  const runtimeResolution = normalizeRuntimeSubstrateKind(runtimeKind, { admittedRuntimeSubstrateKinds, runtimeContractSchema });
  if (runtimeResolution.status === 'refused') return runtimeResolution;

  if (carrierKind === AGENT_CLI_CARRIER_KIND && runtimeKind !== NARADA_AGENT_RUNTIME_SERVER_KIND) {
    return carrierRefusal(carrierKind, {
      admittedCarrierKinds,
      reasonCode: 'carrier_runtime_mismatch',
      reason: 'The agent-cli carrier must launch the narada-agent-runtime-server runtime.',
    });
  }
  if (carrierKind !== AGENT_CLI_CARRIER_KIND && runtimeKind === NARADA_AGENT_RUNTIME_SERVER_KIND) {
    return carrierRefusal(carrierKind, {
      admittedCarrierKinds,
      reasonCode: 'carrier_runtime_mismatch',
      reason: 'narada-agent-runtime-server requires the agent-cli carrier projection.',
    });
  }

  return {
    schema: 'narada.carrier_runtime_selection.v1',
    status: 'accepted',
    carrier_kind: carrierKind,
    runtime_substrate_kind: runtimeKind,
    runtime_contract_schema: runtimeContractSchema,
    carrier_source_field: explicitCarrier ? 'carrier' : 'derived',
    runtime_source_field: explicitRuntime ? 'runtime' : 'derived',
  };
}
