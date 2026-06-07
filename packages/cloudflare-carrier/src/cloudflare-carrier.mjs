import {
  classifyCarrierControlRequest,
  classifyCarrierInputQueueAdmission,
  normalizeInputEvent,
  observerPayload,
  SESSION_EVENT_SCHEMA,
} from '../../carrier-protocol/src/carrier-protocol.mjs';
import { commandTokens } from '../../carrier-command-contract/src/carrier-command-contract.mjs';

export const CLOUDFLARE_CARRIER_KIND = 'cloudflare-carrier';
export const CLOUDFLARE_CARRIER_HOST = 'cloudflare-durable-object';
export const CLOUDFLARE_CARRIER_PROTOCOL = 'narada.carrier.v1';
export const CLOUDFLARE_CARRIER_RUNTIME_CONTRACT = 'narada.carrier.runtime.v1';
export const CLOUDFLARE_CARRIER_IMPLEMENTATION_VERSION = '0.1.0';

const MUTATING_OPERATIONS = new Set([
  'session.start',
  'carrier.input.deliver',
  'carrier.command.execute',
  'carrier.interrupt',
  'session.close',
]);

const SUPPORTED_OPERATIONS = new Set([
  'session.start',
  'session.status',
  'carrier.input.deliver',
  'carrier.command.execute',
  'carrier.interrupt',
  'session.events.read',
  'session.close',
]);

const TERMINAL_STATES = new Set(['completed', 'completed_without_provider', 'failed', 'rejected']);

export class CloudflareCarrierRouter {
  constructor({ now = () => new Date().toISOString() } = {}) {
    this.sessions = new Map();
    this.now = now;
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
      site_root: params.site_root ?? params.site_ref ?? `cloudflare://${params.site_id ?? 'unknown-site'}`,
      site_ref: params.site_ref ?? null,
      now: this.now,
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
    site_root = `cloudflare://${site_id}`,
    site_ref = null,
    now = () => new Date().toISOString(),
  }) {
    if (!carrier_session_id) throw new Error('cloudflare_carrier_session_requires_id');
    if (!agent_id) throw new Error('cloudflare_carrier_session_requires_agent_id');
    this.now = now;
    this.state = {
      carrier_session_id,
      agent_id,
      site_id,
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
      provider_posture: 'refused',
      host_command_targets: ['diagnostic_read', 'runtime_metadata_read'],
      processed_requests: new Map(),
    };
    this.events = [];
  }

  handle(request) {
    const operation = request?.operation;
    if (!SUPPORTED_OPERATIONS.has(operation)) return { ok: false, code: 'unsupported_operation', operation };
    const previousPrincipal = this.currentPrincipal;
    this.currentPrincipal = request?.principal ?? null;
    try {
    if (MUTATING_OPERATIONS.has(operation)) {
      const idempotencyKey = request?.request_id ?? request?.event_id ?? request?.params?.event_id;
      if (idempotencyKey && this.state.processed_requests.has(idempotencyKey)) {
        return clone(this.state.processed_requests.get(idempotencyKey));
      }
      const response = this.#handleFresh(request);
      if (idempotencyKey) this.state.processed_requests.set(idempotencyKey, clone(response));
      return response;
    }
    return this.#handleFresh(request);
    } finally {
      this.currentPrincipal = previousPrincipal;
    }
  }

  status() {
    return {
      ok: true,
      carrier_session_id: this.state.carrier_session_id,
      agent_id: this.state.agent_id,
      site_id: this.state.site_id,
      site_ref: this.state.site_ref,
      carrier_kind: this.state.carrier_kind,
      carrier_host: this.state.carrier_host,
      protocol_version: this.state.protocol_version,
      runtime_contract_version: this.state.runtime_contract_version,
      implementation_version: this.state.implementation_version,
      command_contract_version: '0.1.0',
      provider_adapter_posture: this.state.provider_posture,
      schema_fixture_compatibility: 'carrier-input-pipeline-cases.v1',
      goal: clone(this.state.goal),
      observer_interjections_muted: this.state.observer_interjections_muted,
      queue_count: this.state.queue.length,
      active_turn: this.state.active_turn,
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

  static fromSnapshot(snapshot, { now = () => new Date().toISOString() } = {}) {
    const session = new CloudflareCarrierSession({
      carrier_session_id: snapshot.state.carrier_session_id,
      agent_id: snapshot.state.agent_id,
      site_id: snapshot.state.site_id,
      site_root: snapshot.state.site_root,
      site_ref: snapshot.state.site_ref,
      now,
    });
    session.state = {
      ...clone(snapshot.state),
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
      case 'carrier.input.deliver':
        return this.#deliverInput(request);
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
      site_ref: this.state.site_ref,
    };
    const event = this.#appendEvent('carrier_session_started', payload);
    return { ok: true, operation: 'session.start', carrier_session_id: this.state.carrier_session_id, event };
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
      ? this.#recordProviderRefusal(input, events)
      : 'completed_without_provider';
    if (!admission.creates_turn) {
      events.push(this.#appendEvent('input_completed', {
        input_event_id: input.event_id,
        terminal_state: terminal,
      }));
    }
    return { ok: true, operation: 'carrier.input.deliver', input_event_id: input.event_id, terminal_state: terminal, admitted: true, queued: false, events };
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
      stdout: JSON.stringify(this.status()),
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
    this.state.next_event_sequence += 1;
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
