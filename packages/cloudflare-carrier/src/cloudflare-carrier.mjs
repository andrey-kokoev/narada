import {
  classifyCarrierControlRequest,
  classifyCarrierInputQueueAdmission,
  carrierDirectiveEmitterSpec,
  classifyDirectiveEmissionRequest,
  createCarrierDirectiveInput,
  createDirectiveEmissionAuthorization,
  createDirectiveEmissionRule,
  directiveEmissionPayload,
  createProviderToolCallPayload,
  createToolCallPayload,
  createToolResultPayload,
  normalizeInputEvent,
  observerPayload,
  SESSION_EVENT_SCHEMA,
  validateSessionEvent,
} from '../../carrier-protocol/src/carrier-protocol.mjs';
import { commandTokens } from '../../carrier-command-contract/src/carrier-command-contract.mjs';

export const CLOUDFLARE_CARRIER_KIND = 'cloudflare-carrier';
export const CLOUDFLARE_CARRIER_HOST = 'cloudflare-durable-object';
export const CLOUDFLARE_CARRIER_PROTOCOL = 'narada.carrier.v1';
export const CLOUDFLARE_CARRIER_RUNTIME_CONTRACT = 'narada.carrier.runtime.v1';
export const CLOUDFLARE_CARRIER_IMPLEMENTATION_VERSION = '0.1.0';

const MUTATING_OPERATIONS = new Set([
  'session.start',
  'directive.emit',
  'directive.heartbeat.emit',
  'carrier.input.deliver',
  'session.command.execute',
  'carrier.command.execute',
  'carrier.interrupt',
  'session.close',
]);

const SUPPORTED_OPERATIONS = new Set([
  'session.start',
  'session.status',
  'directive.emit',
  'directive.heartbeat.emit',
  'carrier.input.deliver',
  'session.command.execute',
  'carrier.command.execute',
  'carrier.interrupt',
  'session.events.read',
  'session.close',
]);

const TERMINAL_STATES = new Set(['completed', 'completed_without_provider', 'failed', 'rejected']);
const MAX_PROVIDER_TOOL_ITERATIONS = 3;

export class CloudflareCarrierRouter {
  constructor({ now = () => new Date().toISOString(), providerAdapter = null, toolEffectAdapter = null, taskStoreAdapter = null } = {}) {
    this.sessions = new Map();
    this.now = now;
    this.providerAdapter = providerAdapter;
    this.toolEffectAdapter = toolEffectAdapter;
    this.taskStoreAdapter = taskStoreAdapter;
  }

  handle(request) {
    const operation = request?.operation;
    if (!SUPPORTED_OPERATIONS.has(operation)) {
      return { ok: false, code: 'unsupported_operation', operation };
    }
    if (operation === 'session.start') return this.startSession(request);
    const carrierSessionId = request?.carrier_session_id ?? request?.params?.carrier_session_id;
    if (!carrierSessionId) return { ok: false, code: 'missing_carrier_session_id', operation };
    const session = this.sessions.get(carrierSessionId);
    if (!session) return { ok: false, code: 'carrier_session_not_found', carrier_session_id: carrierSessionId };
    return session.handle(request);
  }

  startSession(request) {
    const params = request?.params ?? {};
    const carrierSessionId = params.carrier_session_id ?? request.carrier_session_id;
    if (!carrierSessionId) return { ok: false, code: 'missing_carrier_session_id', operation: 'session.start' };
    if (!params.agent_id) return { ok: false, code: 'missing_agent_id', operation: 'session.start' };
    const existing = this.sessions.get(carrierSessionId);
    if (existing) return existing.handle(request);
    const session = new CloudflareCarrierSession({
      carrier_session_id: carrierSessionId,
      agent_id: params.agent_id,
      site_id: params.site_id ?? 'unknown-site',
      operation_id: params.operation_id ?? null,
      site_root: params.site_root ?? params.site_ref ?? `cloudflare://${params.site_id ?? 'unknown-site'}`,
      site_ref: params.site_ref ?? null,
      now: this.now,
      providerAdapter: this.providerAdapter,
      toolEffectAdapter: this.toolEffectAdapter,
      taskStoreAdapter: this.taskStoreAdapter,
    });
    this.sessions.set(carrierSessionId, session);
    return session.handle(request);
  }
}

export class CloudflareCarrierSession {
  constructor({
    carrier_session_id,
    agent_id,
    site_id = 'unknown-site',
    operation_id = null,
    site_root = `cloudflare://${site_id}`,
    site_ref = null,
    now = () => new Date().toISOString(),
    providerAdapter = null,
    toolEffectAdapter = null,
    taskStoreAdapter = null,
  }) {
    if (!carrier_session_id) throw new Error('cloudflare_carrier_session_requires_id');
    if (!agent_id) throw new Error('cloudflare_carrier_session_requires_agent_id');
    this.now = now;
    this.providerAdapter = providerAdapter;
    this.toolEffectAdapter = toolEffectAdapter;
    this.taskStoreAdapter = taskStoreAdapter;
    this.toolEffectPosture = toolEffectPosture(toolEffectAdapter);
    this.state = {
      carrier_session_id,
      agent_id,
      site_id,
      operation_id,
      site_root,
      site_ref,
      carrier_kind: CLOUDFLARE_CARRIER_KIND,
      carrier_host: CLOUDFLARE_CARRIER_HOST,
      protocol_version: CLOUDFLARE_CARRIER_PROTOCOL,
      runtime_contract_version: CLOUDFLARE_CARRIER_RUNTIME_CONTRACT,
      command_contract_tokens: commandTokens(),
      implementation_version: CLOUDFLARE_CARRIER_IMPLEMENTATION_VERSION,
      next_event_sequence: 1,
      goal: { text: null, state: 'unset' },
      observer_interjections_muted: false,
      queue: [],
      active_turn: null,
      closed: false,
      provider_posture: providerAdapter?.posture ?? 'refused',
      tool_effect_posture: this.toolEffectPosture.posture,
      tool_effect_adapter_kind: this.toolEffectPosture.adapter_kind,
      tool_effect_supported_tools: this.toolEffectPosture.supported_tools,
      tool_effect_capabilities: this.toolEffectPosture.capabilities,
      host_command_targets: ['diagnostic_read', 'runtime_metadata_read'],
      directive_emission_authorizations: [],
      directive_emission_rules: [],
      directive_emission_sequence: 0,
      processed_requests: new Map(),
    };
    this.events = [];
  }

  handle(request) {
    const operation = request?.operation;
    if (!SUPPORTED_OPERATIONS.has(operation)) return { ok: false, code: 'unsupported_operation', operation };
    const previousPrincipal = this.currentPrincipal;
    this.currentPrincipal = request?.principal ?? null;
    let restoreNow = true;
    try {
    if (MUTATING_OPERATIONS.has(operation)) {
      const idempotencyKey = request?.request_id ?? request?.event_id ?? request?.params?.event_id;
      if (idempotencyKey && this.state.processed_requests.has(idempotencyKey)) {
        return clone(this.state.processed_requests.get(idempotencyKey));
      }
      const response = this.#handleFresh(request);
      if (isPromiseLike(response)) {
        restoreNow = false;
        return response.then((resolved) => {
          if (idempotencyKey) this.state.processed_requests.set(idempotencyKey, clone(resolved));
          return resolved;
        }).finally(() => {
          this.currentPrincipal = previousPrincipal;
        });
      }
      if (idempotencyKey) this.state.processed_requests.set(idempotencyKey, clone(response));
      return response;
    }
    return this.#handleFresh(request);
    } finally {
      if (restoreNow) this.currentPrincipal = previousPrincipal;
    }
  }

  status() {
    const tasks = this.#taskSnapshot();
    if (isPromiseLike(tasks)) return tasks.then((resolvedTasks) => this.#statusWithTasks(resolvedTasks));
    return this.#statusWithTasks(tasks);
  }

  #statusWithTasks(tasks) {
    return {
      ok: true,
      carrier_session_id: this.state.carrier_session_id,
      agent_id: this.state.agent_id,
      site_id: this.state.site_id,
      operation_id: this.state.operation_id ?? null,
      site_ref: this.state.site_ref,
      carrier_kind: this.state.carrier_kind,
      carrier_host: this.state.carrier_host,
      protocol_version: this.state.protocol_version,
      runtime_contract_version: this.state.runtime_contract_version,
      implementation_version: this.state.implementation_version,
      command_contract_version: '0.1.0',
      provider_adapter_posture: this.state.provider_posture,
      tool_effect_posture: this.state.tool_effect_posture,
      tool_effect_adapter_kind: this.state.tool_effect_adapter_kind,
      tool_effect_supported_tools: clone(this.state.tool_effect_supported_tools),
      tool_effect_capabilities: clone(this.state.tool_effect_capabilities ?? []),
      schema_fixture_compatibility: 'carrier-input-pipeline-cases.v1',
      goal: clone(this.state.goal),
      observer_interjections_muted: this.state.observer_interjections_muted,
      queue_count: this.state.queue.length,
      active_turn: this.state.active_turn,
      directive_emission_authorization_count: this.state.directive_emission_authorizations.length,
      directive_emission_rule_count: this.state.directive_emission_rules.length,
      tasks,
      closed: this.state.closed,
      next_event_sequence: this.state.next_event_sequence,
    };
  }

  readEvents({ after_sequence = 0, limit = 100 } = {}) {
    const boundedLimit = Math.max(0, Math.min(Number(limit) || 100, 500));
    const events = this.events
      .filter((event) => event.sequence > after_sequence)
      .slice(0, boundedLimit)
      .map((event) => clone(event));
    return {
      ok: true,
      events,
      next_cursor: events.length > 0 ? events.at(-1).sequence : after_sequence,
    };
  }

  snapshot() {
    const { processed_requests, ...state } = this.state;
    return {
      state: clone(state),
      processed_requests: [...processed_requests.entries()].map(([key, value]) => [key, clone(value)]),
      events: this.events.map((event) => clone(event)),
    };
  }

  static fromSnapshot(snapshot, { now = () => new Date().toISOString(), providerAdapter = null, toolEffectAdapter = null, taskStoreAdapter = null } = {}) {
    const session = new CloudflareCarrierSession({
      carrier_session_id: snapshot.state.carrier_session_id,
      agent_id: snapshot.state.agent_id,
      site_id: snapshot.state.site_id,
      operation_id: snapshot.state.operation_id ?? null,
      site_root: snapshot.state.site_root,
      site_ref: snapshot.state.site_ref,
      now,
      providerAdapter,
      toolEffectAdapter,
      taskStoreAdapter,
    });
    session.state = {
      ...clone(snapshot.state),
      provider_posture: providerAdapter?.posture ?? snapshot.state.provider_posture,
      tool_effect_posture: session.toolEffectPosture.posture,
      tool_effect_adapter_kind: session.toolEffectPosture.adapter_kind,
      tool_effect_supported_tools: session.toolEffectPosture.supported_tools,
      tool_effect_capabilities: session.toolEffectPosture.capabilities,
      directive_emission_authorizations: clone(snapshot.state.directive_emission_authorizations ?? []),
      directive_emission_rules: clone(snapshot.state.directive_emission_rules ?? []),
      directive_emission_sequence: snapshot.state.directive_emission_sequence ?? 0,
      processed_requests: new Map((snapshot.processed_requests ?? []).map(([key, value]) => [key, clone(value)])),
    };
    session.events = (snapshot.events ?? []).map((event) => clone(event));
    return session;
  }

  #handleFresh(request) {
    switch (request.operation) {
      case 'session.start':
        return this.#start(request);
      case 'session.status':
        return this.status();
      case 'directive.emit':
        return this.#emitDirective(request);
      case 'directive.heartbeat.emit':
        return this.#emitDirective({
          ...request,
          params: { ...(request.params ?? {}), directive_kind: 'operation_heartbeat' },
        });
      case 'carrier.input.deliver':
        return this.#deliverInput(request);
      case 'session.command.execute':
        return this.#executeCommand(request);
      case 'carrier.command.execute':
        return this.#executeCommand(request);
      case 'carrier.interrupt':
        return this.#interrupt(request);
      case 'session.events.read':
        return this.readEvents(request.params ?? request);
      case 'session.close':
        return this.#close(request);
      default:
        return { ok: false, code: 'unsupported_operation', operation: request.operation };
    }
  }

  #start(request) {
    const payload = {
      carrier_kind: this.state.carrier_kind,
      carrier_host: this.state.carrier_host,
      protocol_version: this.state.protocol_version,
      runtime_contract_version: this.state.runtime_contract_version,
      principal: request.principal ?? null,
      operation_id: this.state.operation_id ?? null,
      site_ref: this.state.site_ref,
      site_binding_evidence: request.params?.site_binding_evidence ?? null,
      site_authority_decision: request.params?.site_authority_decision ?? null,
    };
    const event = this.#appendEvent('carrier_session_started', payload);
    return { ok: true, operation: 'session.start', carrier_session_id: this.state.carrier_session_id, event };
  }

  #directiveEmissionTarget(directiveKind, params = {}) {
    const spec = carrierDirectiveEmitterSpec(directiveKind);
    if (params.target) return params.target;
    if (spec.target_kind === 'operation') return { kind: 'operation', id: params.operation_id ?? this.state.operation_id ?? null };
    if (spec.target_kind === 'site') return { kind: 'site', id: params.site_id ?? this.state.site_id ?? null };
    if (spec.target_kind === 'operator') return { kind: 'operator', id: params.operator_id ?? null };
    if (spec.target_kind === 'observer') return { kind: 'observer', id: params.observer_id ?? null };
    return { kind: 'carrier_session', id: this.state.carrier_session_id };
  }

  #ensureDirectiveEmissionRule(request = {}) {
    const params = request.params ?? {};
    const spec = carrierDirectiveEmitterSpec(params.directive_kind ?? 'operation_heartbeat');
    const directiveKind = spec.directive_kind;
    const timestamp = this.now();
    const authorizationId = params.authorization_id ?? `auth_${directiveKind}_${this.state.carrier_session_id}`;
    const ruleId = params.rule_id ?? `directive_emission_rule_${directiveKind}_${this.state.carrier_session_id}`;
    const target = this.#directiveEmissionTarget(directiveKind, params);
    let authorization = this.state.directive_emission_authorizations.find((entry) => entry.authorization_id === authorizationId) ?? null;
    let rule = this.state.directive_emission_rules.find((entry) => entry.rule_id === ruleId) ?? null;
    const events = [];
    if (!authorization) {
      authorization = createDirectiveEmissionAuthorization({
        authorization_id: authorizationId,
        directive_kind: directiveKind,
        cadence: params.cadence ?? spec.default_cadence,
        authorized_by: params.authorized_by ?? { kind: 'principal', id: request.principal?.principal_id ?? 'principal:service' },
        authorized_emitter: params.authorized_emitter ?? { kind: 'system', id: params.source_id ?? spec.default_source_id },
        authority: params.authority ?? spec.default_authority,
        target,
        status: 'authorized',
        created_at: timestamp,
      });
      this.state.directive_emission_authorizations.push(authorization);
      events.push(this.#appendEvent('directive_emission_authorized', authorization));
    }
    if (!rule) {
      rule = createDirectiveEmissionRule({
        rule_id: ruleId,
        authorization_id: authorization.authorization_id,
        directive_kind: directiveKind,
        cadence: params.cadence ?? authorization.cadence ?? spec.default_cadence,
        visibility: params.visibility ?? spec.default_visibility,
        target,
        status: 'active',
        created_at: timestamp,
      });
      this.state.directive_emission_rules.push(rule);
      events.push(this.#appendEvent('directive_emission_rule_recorded', rule));
    }
    return { authorization, rule, events };
  }

  #emitDirective(request) {
    if (this.state.closed) return this.#rejectClosed(request.operation ?? 'directive.emit');
    const params = request.params ?? {};
    const directiveKind = params.directive_kind ?? 'operation_heartbeat';
    const target = this.#directiveEmissionTarget(directiveKind, params);
    const preflight = classifyDirectiveEmissionRequest({
      directive_kind: directiveKind,
      enabled: params.enabled ?? true,
      target,
    });
    if (preflight.action !== 'emit') {
      return { ok: false, operation: request.operation ?? 'directive.emit', code: preflight.reason, directive_kind: directiveKind };
    }
    const spec = preflight.spec;
    const { authorization, rule, events } = this.#ensureDirectiveEmissionRule({ ...request, params: { ...params, directive_kind: spec.directive_kind, target } });
    const ruleDecision = classifyDirectiveEmissionRequest({ directive_kind: spec.directive_kind, rule, target });
    if (ruleDecision.action !== 'emit') {
      return { ok: false, operation: request.operation ?? 'directive.emit', code: ruleDecision.reason, directive_kind: spec.directive_kind };
    }
    const emittedAt = this.now();
    this.state.directive_emission_sequence += 1;
    const input = createCarrierDirectiveInput({
      directive_kind: spec.directive_kind,
      event_id: params.input_event_id ?? `input_${spec.directive_kind}_${this.state.carrier_session_id}_${this.state.directive_emission_sequence}`,
      directive_id: params.directive_id ?? `dir_${spec.directive_kind}_${this.state.carrier_session_id}_${this.state.directive_emission_sequence}`,
      authorization_id: authorization.authorization_id,
      rule_id: rule.rule_id,
      operation_id: params.operation_id ?? this.state.operation_id ?? null,
      carrier_session_id: this.state.carrier_session_id,
      site_id: params.site_id ?? this.state.site_id ?? null,
      operator_id: params.operator_id ?? null,
      observer_id: params.observer_id ?? null,
      created_at: emittedAt,
      source_id: authorization.authorized_emitter?.id ?? spec.default_source_id,
      cadence: rule.cadence,
      visibility: rule.visibility,
      reason: params.reason ?? spec.default_reason,
      content: params.content ?? spec.content,
      target,
    });
    events.push(this.#appendEvent('directive_emitted', directiveEmissionPayload({ authorization, rule, input, emitted_at: emittedAt })));
    const delivery = this.#deliverInput({
      operation: 'carrier.input.deliver',
      request_id: params.delivery_request_id ?? `request_${input.event_id}`,
      params: { input },
      principal: request.principal ?? null,
    });
    const response = (resolved) => ({
      ok: true,
      operation: request.operation ?? 'directive.emit',
      directive_kind: spec.directive_kind,
      carrier_session_id: this.state.carrier_session_id,
      input_event_id: input.event_id,
      directive_id: input.directive_id,
      terminal_state: resolved.terminal_state,
      authorization: clone(authorization),
      rule: clone(rule),
      events: [...events, ...(resolved.events ?? [])],
      delivery: resolved,
    });
    return isPromiseLike(delivery) ? delivery.then(response) : response(delivery);
  }
  #deliverInput(request) {
    if (this.state.closed) return this.#rejectClosed('carrier.input.deliver');
    const input = normalizeInputEvent(request?.params?.input ?? request?.input);
    const admission = classifyCarrierInputQueueAdmission(input, {
      activeTurn: this.state.active_turn !== null,
      composerHasDraft: false,
      observerMuted: this.state.observer_interjections_muted,
    });
    const events = [];
    for (const queueEvent of admission.queue_events) events.push(this.#appendEvent(queueEvent.event_kind, queueEvent.payload));
    for (const admissionEvent of admission.admission_events) events.push(this.#appendEvent(admissionEvent.event_kind, admissionEvent.payload));
    for (const visibleEvent of admission.visible_events) events.push(this.#appendEvent(visibleEvent.event_kind, visibleEvent.payload));

    if (admission.admission_action === 'hold') {
      return { ok: true, operation: 'carrier.input.deliver', input_event_id: input.event_id, terminal_state: null, admitted: false, queued: false, events };
    }
    if (admission.admission_action === 'queue') {
      this.state.queue.push(input);
      return { ok: true, operation: 'carrier.input.deliver', input_event_id: input.event_id, terminal_state: null, admitted: false, queued: true, events };
    }
    if (admission.admission_action !== 'admit') {
      const event = this.#appendEvent('input_completed', {
        input_event_id: input.event_id,
        terminal_state: 'rejected',
        reason: admission.admission_reason,
      });
      events.push(event);
      return { ok: true, operation: 'carrier.input.deliver', input_event_id: input.event_id, terminal_state: 'rejected', admitted: false, queued: false, events };
    }

    if (admission.complete_without_provider) {
      const event = this.#appendEvent('input_completed', {
        input_event_id: input.event_id,
        terminal_state: 'completed_without_provider',
      });
      events.push(event);
      return { ok: true, operation: 'carrier.input.deliver', input_event_id: input.event_id, terminal_state: 'completed_without_provider', admitted: true, queued: false, events };
    }

    const terminal = admission.creates_turn
      ? this.#recordProviderTurn(input, events)
      : 'completed_without_provider';
    if (isPromiseLike(terminal)) {
      return terminal.then((terminalState) => ({
        ok: true,
        operation: 'carrier.input.deliver',
        input_event_id: input.event_id,
        terminal_state: terminalState,
        admitted: true,
        queued: false,
        events,
      }));
    }
    if (!admission.creates_turn) {
      events.push(this.#appendEvent('input_completed', {
        input_event_id: input.event_id,
        terminal_state: terminal,
      }));
    }
    return { ok: true, operation: 'carrier.input.deliver', input_event_id: input.event_id, terminal_state: terminal, admitted: true, queued: false, events };
  }

  #recordProviderTurn(input, events) {
    if (!this.providerAdapter) return this.#recordProviderRefusal(input, events);
    return this.#recordProviderExecution(input, events);
  }

  async #recordProviderExecution(input, events) {
    const turnId = `turn_${input.event_id}`;
    this.state.active_turn = { turn_id: turnId, input_event_id: input.event_id, state: 'active' };
    events.push(this.#appendEvent('turn_started', { turn_id: turnId, input_event_id: input.event_id }));
    events.push(this.#appendEvent('provider_request_recorded', {
      schema: 'narada.agent_tui.provider_request_payload.v0',
      turn_id: turnId,
      input_event_id: input.event_id,
      provider_request_status: 'dispatched',
      provider_execution_enabled: true,
      provider_runtime_status: 'available',
      provider_adapter_admission_status: 'admitted',
      provider_adapter_kind: this.providerAdapter.adapter_kind,
      provider: this.providerAdapter.provider,
      model: this.providerAdapter.model,
      thinking: null,
      stream: false,
      provider_streaming_contract: 'none',
      provider_adapter_refusal_reason: null,
      content_preview: input.content,
    }));
    try {
      let result = await this.providerAdapter.run({ input, turn_id: turnId });
      let textSequence = 1;
      let toolSequence = 2;
      for (let iteration = 0; iteration <= MAX_PROVIDER_TOOL_ITERATIONS; iteration += 1) {
        const text = String(result.text ?? '').trim();
        events.push(this.#appendEvent('provider_text_delta_recorded', {
          schema: 'narada.agent_tui.provider_output_payload.v0',
          turn_id: turnId,
          provider_output_kind: 'text_delta',
          sequence: textSequence,
          text_delta: text,
          text_delta_ref: null,
        }));
        textSequence += 1;
        const recorded = await this.#recordProviderToolCalls(result.tool_calls, turnId, events, toolSequence);
        toolSequence = recorded.nextSequence;
        if (recorded.toolResults.length === 0) break;
        if (iteration === MAX_PROVIDER_TOOL_ITERATIONS) throw new Error('cloudflare_carrier_tool_iteration_limit_exceeded');
        events.push(this.#appendEvent('provider_request_recorded', {
          schema: 'narada.agent_tui.provider_request_payload.v0',
          turn_id: turnId,
          input_event_id: input.event_id,
          provider_request_status: 'dispatched',
          provider_execution_enabled: true,
          provider_runtime_status: 'available',
          provider_adapter_admission_status: 'admitted',
          provider_adapter_kind: this.providerAdapter.adapter_kind,
          provider: this.providerAdapter.provider,
          model: this.providerAdapter.model,
          thinking: null,
          stream: false,
          provider_streaming_contract: 'none',
          provider_adapter_refusal_reason: null,
          content_preview: 'tool_results',
          tool_result_count: recorded.toolResults.length,
        }));
        result = await this.providerAdapter.run({
          input,
          turn_id: turnId,
          tool_results: recorded.toolResults,
        });
      }
      events.push(this.#appendEvent('turn_completed', {
        schema: 'narada.agent_tui.turn_terminal_payload.v0',
        turn_id: turnId,
        input_event_id: input.event_id,
        provider_request_status: 'completed',
        terminal_status: 'completed',
        provider_execution_enabled: true,
      }));
      events.push(this.#appendEvent('input_completed', {
        input_event_id: input.event_id,
        terminal_state: 'completed',
      }));
      this.state.active_turn = null;
      return 'completed';
    } catch (error) {
      events.push(this.#appendEvent('turn_failed', {
        schema: 'narada.agent_tui.turn_terminal_payload.v0',
        turn_id: turnId,
        input_event_id: input.event_id,
        provider_request_status: 'failed',
        terminal_status: 'failed',
        provider_execution_enabled: true,
        error_summary: providerErrorSummary(error),
      }));
      events.push(this.#appendEvent('input_completed', {
        input_event_id: input.event_id,
        terminal_state: 'failed',
      }));
      this.state.active_turn = null;
      return 'failed';
    }
  }

  async #recordProviderToolCalls(toolCalls, turnId, events, startSequence = 2) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return { toolResults: [], nextSequence: startSequence };
    const toolResults = [];
    let sequence = startSequence;
    for (const rawToolCall of toolCalls) {
      const toolCall = normalizeProviderToolCall(rawToolCall);
      events.push(this.#appendEvent('provider_tool_call_requested', createProviderToolCallPayload({
        turn_id: turnId,
        sequence,
        tool_name: toolCall.tool_name,
        arguments_summary: toolCall.arguments_summary,
        arguments_ref: toolCall.arguments_ref,
      })));
      const payload = await this.#executeToolEffectAndRecordResult(toolCall, events, { turn_id: turnId });
      events.push(this.#appendEvent('tool_result_received', payload));
      toolResults.push(payload);
      sequence += 1;
    }
    return { toolResults, nextSequence: sequence };
  }

  async #executeToolEffectAndRecordResult(toolCall, events, { turn_id = null } = {}) {
    events.push(this.#appendEvent('tool_call_requested', createToolCallPayload({
      tool_name: toolCall.tool_name,
      arguments_summary: toolCall.arguments_summary,
      arguments_ref: toolCall.arguments_ref,
      requesting_agent_id: this.state.agent_id,
    })));
    const startedAt = Date.now();
    const result = await executeToolEffect(this.toolEffectAdapter, toolCall, {
      carrier_session_id: this.state.carrier_session_id,
      agent_id: this.state.agent_id,
      site_id: this.state.site_id,
      turn_id,
      principal: this.currentPrincipal ?? null,
      taskStore: this.#taskStore(),
    });
    return createToolResultPayload({
      tool_name: toolCall.tool_name,
      status: result.status,
      admission_action: result.admission_action,
      admission_reason: result.admission_reason,
      capability_ref: result.capability_ref,
      effect_scope: result.effect_scope,
      authority_ref: result.authority_ref,
      duration_ms: Math.max(0, Date.now() - startedAt),
      result_summary: result.result_summary,
      result_ref: result.result_ref ?? null,
    });
  }

  #recordProviderRefusal(input, events) {
    const turnId = `turn_${input.event_id}`;
    this.state.active_turn = { turn_id: turnId, input_event_id: input.event_id, state: 'active' };
    events.push(this.#appendEvent('turn_started', { turn_id: turnId, input_event_id: input.event_id }));
    events.push(this.#appendEvent('provider_request_recorded', {
      schema: 'narada.agent_tui.provider_request_payload.v0',
      turn_id: turnId,
      input_event_id: input.event_id,
      provider_request_status: 'refused',
      provider_execution_enabled: false,
      provider_runtime_status: 'unavailable',
      provider_adapter_admission_status: 'rejected',
      provider_adapter_kind: 'cloudflare-carrier-refused',
      provider: null,
      model: null,
      thinking: null,
      stream: false,
      provider_streaming_contract: 'none',
      provider_adapter_refusal_reason: 'provider_execution_not_implemented_for_cloudflare_carrier_first_slice',
      content_preview: input.content,
    }));
    events.push(this.#appendEvent('turn_failed', {
      schema: 'narada.agent_tui.turn_terminal_payload.v0',
      turn_id: turnId,
      input_event_id: input.event_id,
      provider_request_status: 'refused',
      terminal_status: 'failed',
      provider_execution_enabled: false,
      error_summary: 'provider_execution_not_implemented_for_cloudflare_carrier_first_slice',
    }));
    events.push(this.#appendEvent('input_completed', {
      input_event_id: input.event_id,
      terminal_state: 'failed',
    }));
    this.state.active_turn = null;
    return 'failed';
  }

  #executeCommand(request) {
    if (this.state.closed) return this.#rejectClosed('carrier.command.execute');
    const params = request.params ?? {};
    const command = String(params.command ?? request.command ?? '').trim();
    const args = params.args ?? request.args ?? [];
    if (!command) return { ok: false, code: 'missing_command', operation: 'carrier.command.execute' };
    if (command === '/goal' || command === 'goal') return this.#goalCommand(command, args, request);
    if (command === '/observers' || command === 'observers') return this.#simpleCommand(command, { observer_interjections_muted: this.state.observer_interjections_muted });
    if (command === '/observer mute' || command === 'observer.mute') {
      this.state.observer_interjections_muted = true;
      return this.#simpleCommand(command, { observer_interjections_muted: true });
    }
    if (command === '/observer unmute' || command === 'observer.unmute') {
      this.state.observer_interjections_muted = false;
      return this.#simpleCommand(command, { observer_interjections_muted: false });
    }
    if (command === '/task' || command === 'task') return this.#taskCommand(command, args);
    if (command === '/tasks' || command === 'tasks') {
      const tasks = this.#taskSnapshot();
      return isPromiseLike(tasks)
        ? tasks.then((resolvedTasks) => this.#simpleCommand(command, { tasks: resolvedTasks }))
        : this.#simpleCommand(command, { tasks });
    }
    if (command === '/queue' || command === 'queue.show') return this.#simpleCommand(command, { queue_count: this.state.queue.length });
    if (command === 'host.command' || command === '/host') return this.#hostCommand(params, request);
    return this.#simpleCommand(command, { command_status: 'unsupported', terminal_state: 'rejected' }, false);
  }

  #goalCommand(command, args, request) {
    const words = Array.isArray(args) ? args.map(String) : String(args ?? '').split(/\s+/).filter(Boolean);
    const verb = words[0] ?? 'show';
    if (verb === 'show') return this.#simpleCommand(command, { goal: clone(this.state.goal) });
    if (verb === 'clear') this.state.goal = { text: null, state: 'unset' };
    else if (verb === 'pause') this.state.goal = { ...this.state.goal, state: 'paused' };
    else if (verb === 'resume') this.state.goal = { ...this.state.goal, state: this.state.goal.text ? 'active' : 'unset' };
    else this.state.goal = { text: words.join(' '), state: 'active' };
    return this.#simpleCommand(command, { goal: clone(this.state.goal), principal: request.principal ?? null });
  }

  async #taskCommand(command, args) {
    const words = Array.isArray(args) ? args.map(String) : String(args ?? '').split(/\s+/).filter(Boolean);
    const verb = words[0] ?? 'list';
    if (verb === 'list' || verb === 'show') return this.#simpleCommand(command, { tasks: await this.#taskSnapshot() });
    const events = [];
    if (verb === 'create') {
      const title = words.slice(1).join(' ').trim();
      const toolCall = {
        tool_name: 'cloudflare_carrier_task_create',
        arguments_summary: JSON.stringify({ title }),
        arguments_ref: null,
      };
      const payload = await this.#executeToolEffectAndRecordResult(toolCall, events, { turn_id: null });
      events.push(this.#appendEvent('tool_result_received', payload));
      return { ok: payload.status !== 'denied', operation: 'carrier.command.execute', command, terminal_state: payload.status === 'ok' ? 'completed' : 'rejected', events };
    }
    if (verb === 'update') {
      const taskId = words[1];
      const status = words[2];
      const note = words.slice(3).join(' ').trim();
      const toolCall = {
        tool_name: 'cloudflare_carrier_task_update',
        arguments_summary: JSON.stringify({ task_id: taskId, status, note }),
        arguments_ref: null,
      };
      const payload = await this.#executeToolEffectAndRecordResult(toolCall, events, { turn_id: null });
      events.push(this.#appendEvent('tool_result_received', payload));
      return { ok: payload.status !== 'denied', operation: 'carrier.command.execute', command, terminal_state: payload.status === 'ok' ? 'completed' : 'rejected', events };
    }
    return this.#simpleCommand(command, { command_status: 'unsupported_task_command', terminal_state: 'rejected' }, false);
  }

  #taskStore() {
    if (!this.taskStoreAdapter || typeof this.taskStoreAdapter.forSession !== 'function') return null;
    return this.taskStoreAdapter.forSession({
      carrier_session_id: this.state.carrier_session_id,
      agent_id: this.state.agent_id,
      site_id: this.state.site_id,
      site_root: this.state.site_root,
      now: this.now,
    });
  }

  #taskSnapshot() {
    const store = this.#taskStore();
    if (!store || typeof store.list !== 'function') return [];
    return Promise.resolve(store.list()).then((tasks) => clone(tasks));
  }

  #hostCommand(params, request) {
    const target = params.target ?? 'unsupported';
    const command_text = params.command_text ?? params.command ?? '';
    const requested = this.#appendEvent('carrier_host_command_requested', hostCommandPayload({ target, command_text, principal: request.principal ?? null }));
    if (!this.state.host_command_targets.includes(target)) {
      const rejected = this.#appendEvent('carrier_host_command_rejected', {
        ...hostCommandPayload({ target, command_text, principal: request.principal ?? null }),
        admission_action: 'reject',
        admission_reason: 'unsupported_cloudflare_host_command_target',
        terminal_state: 'rejected',
      });
      return { ok: true, operation: 'carrier.command.execute', command: 'host.command', terminal_state: 'rejected', events: [requested, rejected] };
    }
    const admitted = this.#appendEvent('carrier_host_command_admitted', {
      ...hostCommandPayload({ target, command_text, principal: request.principal ?? null }),
      admission_action: 'admit',
      admission_reason: 'diagnostic_read_only',
      terminal_state: null,
    });
    const started = this.#appendEvent('carrier_host_command_started', {
      command_id: `host_${requested.sequence}`,
      started_at: this.now(),
      ...hostCommandPayload({ target, command_text, principal: request.principal ?? null }),
    });
    const status = this.status();
    const completed = this.#appendEvent('carrier_host_command_completed', {
      command_id: `host_${requested.sequence}`,
      command_text,
      command_summary: `cloudflare carrier ${target}`,
      redaction_applied: false,
      working_directory: 'cloudflare://carrier',
      exit_code: 0,
      terminal_state: 'completed',
      duration_ms: 0,
      output_truncated: false,
      stdout: JSON.stringify(isPromiseLike(status) ? { ...this.state, tasks: [] } : status),
      stderr: '',
    });
    return { ok: true, operation: 'carrier.command.execute', command: 'host.command', terminal_state: 'completed', events: [requested, admitted, started, completed] };
  }

  #simpleCommand(command, details = {}, ok = true) {
    const terminal_state = details.terminal_state ?? 'completed';
    const event = this.#appendEvent('carrier_command_executed', { command, details, terminal_state });
    return { ok, operation: 'carrier.command.execute', command, terminal_state, event };
  }

  #interrupt(request) {
    const turnId = this.state.active_turn?.turn_id ?? request.params?.turn_id ?? 'turn_unbound_cloudflare_interrupt';
    const event = this.#appendEvent('interrupt_requested', { turn_id: turnId, reason: request.params?.reason ?? 'carrier_interrupt' });
    return { ok: true, operation: 'carrier.interrupt', event };
  }

  #close(request) {
    this.state.closed = true;
    const event = this.#appendEvent('carrier_session_closed', { reason: request.params?.reason ?? 'operator_requested' });
    return { ok: true, operation: 'session.close', event };
  }

  #rejectClosed(operation) {
    const event = this.#appendEvent('carrier_diagnostic_recorded', {
      level: 'warn',
      code: 'carrier_session_closed',
      message: `${operation} rejected because the session is closed`,
    });
    return { ok: false, code: 'carrier_session_closed', operation, event };
  }

  #appendEvent(event_kind, payload = {}) {
    const sequence = this.state.next_event_sequence;
    const eventPayload = this.currentPrincipal && !Object.prototype.hasOwnProperty.call(payload, 'principal')
      ? { ...payload, principal: clone(this.currentPrincipal) }
      : payload;
    const event = {
      schema: SESSION_EVENT_SCHEMA,
      event_id: `session_event_cloudflare_${sequence}`,
      sequence,
      occurred_at: this.now(),
      carrier_session_id: this.state.carrier_session_id,
      agent_id: this.state.agent_id,
      site_id: this.state.site_id,
      site_root: this.state.site_root,
      site_ref: this.state.site_ref,
      event_kind,
      payload: eventPayload,
    };
    assertNoSecretValues(event);
    const validationErrors = validateSessionEvent(event);
    if (validationErrors.length > 0) {
      throw new Error(`cloudflare_carrier_invalid_session_event:${validationErrors.join(',')}`);
    }
    this.state.next_event_sequence += 1;
    this.events.push(event);
    return clone(event);
  }
}

function hostCommandPayload({ target, command_text, principal }) {
  return {
    command_target: target,
    command_text,
    command_summary: command_text || target,
    requesting_principal: principal,
  };
}

function assertNoSecretValues(value) {
  const text = JSON.stringify(value).toLowerCase();
  if (text.includes('secret_value') || text.includes('sk-live') || text.includes('api_key_value')) {
    throw new Error('cloudflare_carrier_evidence_contains_secret_value');
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPromiseLike(value) {
  return value && typeof value.then === 'function';
}

function toolEffectPosture(toolEffectAdapter) {
  if (!toolEffectAdapter) {
    return {
      posture: 'unconfigured',
      adapter_kind: null,
      supported_tools: [],
      capabilities: [],
    };
  }
  return {
    posture: toolEffectAdapter.posture ?? 'configured',
    adapter_kind: toolEffectAdapter.adapter_kind ?? 'unknown-tool-effect-adapter',
    supported_tools: Array.isArray(toolEffectAdapter.supported_tools) ? [...toolEffectAdapter.supported_tools] : [],
    capabilities: Array.isArray(toolEffectAdapter.capabilities) ? clone(toolEffectAdapter.capabilities) : [],
  };
}

function normalizeProviderToolCall(rawToolCall) {
  return {
    tool_name: String(rawToolCall?.tool_name ?? rawToolCall?.name ?? '').trim() || 'unknown_tool',
    arguments_summary: String(rawToolCall?.arguments_summary ?? rawToolCall?.arguments ?? '{}'),
    arguments_ref: rawToolCall?.arguments_ref ?? null,
  };
}

async function executeToolEffect(toolEffectAdapter, toolCall, context) {
  if (!toolEffectAdapter || typeof toolEffectAdapter.execute !== 'function') {
    return {
      status: 'denied',
      admission_action: 'deny',
      admission_reason: 'tool_effect_adapter_unconfigured',
      result_summary: 'tool_effect_adapter_unconfigured',
      result_ref: null,
    };
  }
  try {
    const result = await toolEffectAdapter.execute({ toolCall, context });
    const normalized = {
      status: String(result?.status ?? 'ok'),
      capability_ref: result?.capability_ref,
      effect_scope: result?.effect_scope,
      authority_ref: result?.authority_ref,
      result_summary: String(result?.result_summary ?? result?.summary ?? 'tool_effect_completed'),
      result_ref: result?.result_ref ?? null,
    };
    if (result?.admission_action !== undefined || result?.admission_reason !== undefined) {
      normalized.admission_action = result?.admission_action ?? (result?.status === 'denied' ? 'deny' : 'admit');
      normalized.admission_reason = result?.admission_reason;
    }
    return normalized;
  } catch (error) {
    return {
      status: 'failed',
      result_summary: providerErrorSummary(error),
      result_ref: null,
    };
  }
}

function providerErrorSummary(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 240) || 'cloudflare_workers_ai_provider_failed';
}

export function classifyCloudflareCarrierControl(request = {}) {
  const base = classifyCarrierControlRequest({ method: request.operation, params: request.params ?? {} });
  return {
    ...base,
    cloudflare_supported: SUPPORTED_OPERATIONS.has(request.operation),
    mutates_session: MUTATING_OPERATIONS.has(request.operation),
  };
}

export function expectedObserverEventKindsForInput(input, state) {
  const admission = classifyCarrierInputQueueAdmission(input, state);
  return [
    ...admission.queue_events.map((event) => event.event_kind),
    ...admission.admission_events.map((event) => event.event_kind),
    ...admission.visible_events.map((event) => event.event_kind),
  ];
}

export function observerEvidencePayload(input, suppression_reason = null) {
  return observerPayload(input, suppression_reason ? { suppression_reason } : {});
}

export function isTerminalState(value) {
  return TERMINAL_STATES.has(value);
}
