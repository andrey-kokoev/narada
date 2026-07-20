import { sha256Digest } from '@narada2/invokable-intelligence-resolver';
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

  function snapshot() {
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
    };
  }

  async function callIntelligence(messages, tools, overrides = {}) {
    const inputDigest = await sha256Digest({ messages: messages ?? null, tools: tools ?? null });
    const deliveryRef = nonEmpty(overrides.inputEventId)
      ?? nonEmpty(overrides.turnId)
      ?? 'unscoped-turn';
    const operationId = `operation:nars:${runtimeContext.session}:${deliveryRef}:${inputDigest.slice('sha256:'.length)}`;
    const result = await gateway.invoke({
      operationId,
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
      ...(runtimeContext.invocationSettings?.invocationScope
        ? { invocationScope: runtimeContext.invocationSettings.invocationScope }
        : {}),
      ...(overrides.invocationEventSink ? { invocationEventSink: overrides.invocationEventSink } : {}),
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
      await validateSelection(target);
      machine.transition('admitted', { target });
      machine.transition('switching', { target });
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

  return Object.freeze({ callIntelligence, primePreflight, snapshot, reconfigure, close });
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
