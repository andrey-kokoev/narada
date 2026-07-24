import { canonicalInvocationInput, sha256Digest } from '@narada2/invokable-intelligence-resolver';
import { createNarsIntelligenceRuntimeReconfigurationStateMachine } from './intelligence-runtime-reconfiguration-state.mjs';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function modelRef(value) {
  const id = typeof value === 'string' ? nonEmpty(value) : nonEmpty(value?.id);
  const kind = typeof value === 'object' && value !== null ? value.kind : 'model';
  if (!id || kind !== 'model' || !id.startsWith('model:')) {
    throw new Error('intelligence_reconfiguration_model_ref_invalid');
  }
  return { kind: 'model', id };
}

function requestedOptions(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('intelligence_reconfiguration_requested_options_invalid');
  }
  return { ...value };
}

function targetFromParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('intelligence_reconfiguration_params_required');
  }
  if (params.provider !== undefined || params.model !== undefined || params.thinking !== undefined) {
    throw new Error('intelligence_reconfiguration_legacy_selection_forbidden');
  }
  const modelInput = params.requested_model ?? params.model_ref;
  const hasModel = modelInput !== undefined && modelInput !== null;
  const hasOptions = params.requested_options !== undefined && params.requested_options !== null;
  if (!hasModel && !hasOptions) throw new Error('intelligence_reconfiguration_target_required');
  return {
    requestedModel: hasModel ? modelRef(modelInput) : null,
    requestedOptions: requestedOptions(params.requested_options),
  };
}

function publicMetadataOnlyResult(result) {
  return {
    schema: 'narada.invokable-intelligence.metadata-only-result.v1',
    response_available: false,
    replayed: Boolean(result?.replayed),
    intent_id: result?.intent?.id ?? null,
    plan_id: result?.plan?.id ?? null,
    attempt_id: result?.attempt?.id ?? null,
    result_id: result?.result?.id ?? null,
    outcome_id: result?.outcome?.id ?? null,
    outcome_kind: result?.outcome?.kind ?? null,
  };
}

function publicPlan(plan) {
  if (!plan) return null;
  return {
    plan_id: plan.id,
    intent_id: plan.intent_id,
    resolver_version: plan.resolver_version,
    model: plan.selected.model,
    model_provider: plan.selected.model_provider,
    model_offering: plan.route.offering,
    inference_provider: plan.selected.inference_provider,
    endpoint: plan.selected.endpoint,
    adapter: plan.selected.adapter,
    credential: plan.selected.credential ?? null,
    topology_id: plan.route.topology_id,
    options: plan.options,
    valid_until: plan.snapshot.valid_until,
    snapshot_digest: plan.snapshot.digest,
  };
}

function publicOutcome(outcome) {
  if (!outcome) return null;
  return {
    outcome_id: outcome.id,
    kind: outcome.kind,
    terminal_at: outcome.terminal_at,
    admission_acknowledged: outcome.admission_acknowledged ?? null,
    error_code: outcome.error?.code ?? null,
  };
}

export class NarsIntelligenceInvocationError extends Error {
  constructor(code, message, result) {
    super(message);
    this.name = 'NarsIntelligenceInvocationError';
    this.code = code;
    this.result = result;
  }
}

export function createNarsIntelligenceRuntimeController({
  runtimeContext = {},
  gateway,
  validateSelection = async () => {},
  now = () => new Date().toISOString(),
  onTransition = () => {},
  kernelHealth = null,
  kernelStartEvidence = null,
  selectionChoices = null,
  reconfigureKernel = null,
  reconfigureExecutionPolicyFn = null,
  isBusy = () => false,
  close = async () => {},
} = {}) {
  if (!gateway || typeof gateway.invoke !== 'function') {
    throw new Error('intelligence_runtime_gateway_required');
  }
  const principal = nonEmpty(runtimeContext.intelligence?.principal);
  if (!principal) throw new Error('intelligence_runtime_principal_required');
  let selection = {
    requestedModel: runtimeContext.intelligence?.requestedModel ?? null,
    requestedOptions: { ...(runtimeContext.intelligence?.requestedOptions ?? {}) },
  };
  let latest = null;
  let lock = null;
  let lastReconfiguration = null;
  let nextRequestNumber = 1;

  async function reconfigureExecutionPolicy(policy, options = {}) {
    if (options.isBusy?.() ?? isBusy()) {
      return {
        accepted: false,
        reason: 'runtime_not_at_clean_turn_boundary',
      };
    }
    if (typeof reconfigureExecutionPolicyFn !== 'function') {
      return {
        accepted: true,
        active: { execution_policy: policy },
        reason: 'execution_policy_bound_by_session_runtime',
      };
    }
    return reconfigureExecutionPolicyFn(policy);
  }

  function snapshot() {
    const projectedKernelHealth = typeof kernelHealth === 'function' ? kernelHealth() : null;
    const projectedSelectionChoices = typeof selectionChoices === 'function'
      ? selectionChoices()
      : selectionChoices ?? {};
    return {
      schema: 'narada.nars.intelligence_runtime_snapshot.v1',
      authority: 'invokable-intelligence-gateway',
      principal,
      requested_model: selection.requestedModel,
      requested_options: { ...selection.requestedOptions },
      latest_plan: publicPlan(latest?.plan),
      latest_outcome: publicOutcome(latest?.outcome),
      latest_attempt_id: latest?.attempt?.id ?? null,
      latest_replayed: latest?.replayed ?? null,
      reconfiguration: lock?.snapshot() ?? lastReconfiguration?.snapshot() ?? null,
      intelligence_kernel_kind: projectedKernelHealth?.kernel_kind ?? runtimeContext.intelligenceKernelKind ?? null,
      kernel: projectedKernelHealth,
      kernel_start_evidence: kernelStartEvidence,
      provider_choices: Array.isArray(projectedSelectionChoices.provider_choices)
        ? [...projectedSelectionChoices.provider_choices]
        : [],
      model_choices: Array.isArray(projectedSelectionChoices.model_choices)
        ? [...projectedSelectionChoices.model_choices]
        : [],
    };
  }

  async function callIntelligence(messages, tools, overrides = {}) {
    // Tool declarations are part of provider request semantics. Binding them
    // into the input digest makes a changed catalog fail closed against an
    // existing explicit intent instead of silently reusing its identity.
    const inputDigest = await sha256Digest(canonicalInvocationInput(messages, tools));
    const deliveryRef = nonEmpty(overrides.inputEventId)
      ?? nonEmpty(overrides.turnId)
      ?? 'unscoped-turn';
    const idempotencyKey = nonEmpty(overrides.idempotencyKey)
      ?? nonEmpty(overrides.idempotency_key);
    const operationId = nonEmpty(overrides.operationId)
      ?? (idempotencyKey
        ? `operation:nars:${runtimeContext.session}:idempotency:${idempotencyKey}`
        : null)
      ?? `operation:nars:${runtimeContext.session}:${deliveryRef}:${inputDigest.slice('sha256:'.length)}`;
    const result = await gateway.invoke({
      operationId,
      ...(nonEmpty(overrides.intentId) ? { intentId: overrides.intentId.trim() } : {}),
      purpose: 'operator-chat',
      principal,
      ...(selection.requestedModel ? { requestedModel: selection.requestedModel } : {}),
      ...(Object.keys(selection.requestedOptions).length ? { requestedOptions: selection.requestedOptions } : {}),
      messages,
      tools,
      abortSignal: overrides.abortSignal ?? undefined,
      inputDigest,
      mode: overrides.mode ?? 'immediate',
      allowReplan: overrides.allowReplan !== false,
      ...(overrides.turnId ? { turnId: overrides.turnId } : {}),
      ...(overrides.inputEventId ? { inputEventId: overrides.inputEventId } : {}),
      ...(overrides.requestId ? { requestId: overrides.requestId } : {}),
      ...(overrides.runtimeRequestId || overrides.runtime_request_id
        ? { runtimeRequestId: overrides.runtimeRequestId ?? overrides.runtime_request_id }
        : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(overrides.turnAttempt || overrides.turn_attempt
        ? { turnAttempt: overrides.turnAttempt ?? overrides.turn_attempt }
        : {}),
      ...(overrides.executionPolicy || overrides.execution_policy
        ? { executionPolicy: overrides.executionPolicy ?? overrides.execution_policy }
        : {}),
      ...(runtimeContext.invocationSettings?.invocationScope
        ? { invocationScope: runtimeContext.invocationSettings.invocationScope }
        : {}),
      ...(overrides.invocationEventSink ? { invocationEventSink: overrides.invocationEventSink } : {}),
      ...(overrides.capabilityGateway !== undefined ? { capabilityGateway: overrides.capabilityGateway } : {}),
    });
    latest = result;
    if (result.kind === 'refusal') {
      await overrides.invocationEventSink?.({
        kind: 'invokable_intelligence_refused',
        intent_id: result.intent.id,
        refusal_id: result.refusal.id,
        reason_code: result.refusal.reason_code,
        outcome_id: result.outcome.id,
      });
      throw new NarsIntelligenceInvocationError(
        `intelligence_refused:${result.refusal.reason_code}`,
        result.refusal.explanation,
        result,
      );
    }
    await overrides.invocationEventSink?.({
      kind: 'invokable_intelligence_terminal',
      intent_id: result.intent.id,
      plan_id: result.plan.id,
      attempt_id: result.attempt.id,
      outcome_id: result.outcome.id,
      outcome_kind: result.outcome.kind,
      replayed: result.replayed,
      selected: publicPlan(result.plan),
    });
    if (result.outcome.kind !== 'success') {
      const code = result.outcome.error?.code ?? `intelligence_${result.outcome.kind}`;
      throw new NarsIntelligenceInvocationError(code, `canonical intelligence invocation ended as ${result.outcome.kind}`, result);
    }
    if (!result.adapterOutcome || result.adapterOutcome.response === undefined) {
      if (result.replayed) {
        return {
          response_available: false,
          intelligence: publicMetadataOnlyResult(result),
        };
      }
      throw new NarsIntelligenceInvocationError(
        'intelligence_result_payload_unavailable',
        'the canonical outcome is durable but its governed response payload is unavailable for delivery',
        result,
      );
    }
    return result.adapterOutcome.response;
  }

  function primePreflight(result) {
    if (!result || typeof result !== 'object') return;
    if (result.plan) {
      latest = result;
      return;
    }
    if (result.schema === 'narada.invokable-intelligence.invocation-plan.v2') {
      latest = { plan: result };
    }
  }

  async function reconfigure(params = {}, options = {}) {
    const requestId = nonEmpty(params?.request_id)
      ?? nonEmpty(params?.requestId)
      ?? `runtime_reconfiguration_${nextRequestNumber++}`;
    const machine = createNarsIntelligenceRuntimeReconfigurationStateMachine({
      requestId,
      metadata: { method: 'runtime.intelligence.reconfigure', authority: 'invokable-intelligence-gateway' },
      now,
      onTransition,
    });
    machine.transition('requested');
    if (lock) {
      machine.transition('refused', { reason: 'reconfiguration_in_progress' });
      lastReconfiguration = machine;
      return intelligenceControllerResult(machine, { target: null });
    }
    lock = machine;
    try {
      machine.transition('validating', { previous_selection: selection });
      const target = targetFromParams(params);
      if (options.isBusy?.() ?? isBusy()) {
        machine.transition('refused', { reason: 'runtime_not_at_clean_turn_boundary', target });
        return intelligenceControllerResult(machine, { target });
      }
      // Keep the resolver's admitted plan private to the control transition,
      // but pass it to the kernel switch so a Pi host consumes the exact NARS
      // provider/model binding that was validated rather than re-resolving
      // from a client-facing model reference.
      const admittedPlan = await validateSelection(target);
      machine.transition('admitted', { target });
      machine.transition('switching', { target });
      if (typeof reconfigureKernel === 'function') {
        const kernelResult = await reconfigureKernel(target, admittedPlan);
        if (kernelResult?.accepted === false) {
          machine.transition('failed', { reason: kernelResult.reason ?? 'kernel_reconfiguration_refused', kernel: kernelResult });
          return intelligenceControllerResult(machine, { target });
        }
      }
      selection = target;
      machine.transition('active', { active: target });
      return intelligenceControllerResult(machine, { active: target });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (machine.state === 'validating' || machine.state === 'admitted') {
        machine.transition('refused', { reason: 'target_not_admitted', error: message });
      } else if (machine.state === 'switching') {
        machine.transition('failed', { reason: 'runtime_reconfiguration_failed', error: message });
      } else {
        throw error;
      }
      return intelligenceControllerResult(machine, { error: message });
    } finally {
      lock = null;
      lastReconfiguration = machine;
    }
  }

  return Object.freeze({ callIntelligence, primePreflight, snapshot, reconfigure, reconfigureExecutionPolicy, close });
}

function intelligenceControllerResult(machine, extras = {}) {
  const terminalRecord = machine.history().at(-1) ?? {};
  return {
    ...machine.snapshot(),
    ...(terminalRecord.reason ? { reason: terminalRecord.reason } : {}),
    ...(terminalRecord.error ? { error: terminalRecord.error } : {}),
    ...extras,
  };
}
