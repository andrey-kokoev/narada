import { NarsKernelContractError } from '@narada2/nars-intelligence-kernel-contract';

const NATIVE_TOOL_NAMES = new Set([
  'read', 'write', 'edit', 'bash', 'shell', 'exec', 'process', 'filesystem',
  'grep', 'find', 'ls', 'glob', 'cat', 'list',
  'filesystem_read', 'filesystem_write', 'file_read', 'file_write',
]);

function toolName(tool) {
  return String(tool?.function?.name ?? tool?.name ?? tool?.tool_name ?? '').trim();
}

function gatewayFailure(name, reason, error, context = {}) {
  return {
    ...refusal(name, reason, context),
    status: 'unknown',
    admission_action: 'admit',
    execution_outcome: 'unknown',
    admission_reason: reason,
    effect_confirmation: 'unknown',
    error: redactErrorMessage(error),
  };
}

function redactErrorMessage(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(
      /(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|password|bearer)["']?\s*[:=]\s*["']?)([^\s,'"`}]+)(["']?)/gi,
      '$1[redacted]$3',
    );
}

function refusal(name, reason, context = {}) {
  return {
    schema: 'narada.nars.pi.tool-proxy-result.v1',
    status: 'denied',
    admission_action: 'deny',
    admission_reason: reason,
    tool_name: name || null,
    effect_confirmation: 'not-confirmed',
    context: {
      agent_id: context.agent_id ?? null,
      session_id: context.session_id ?? null,
      turn_id: context.turn_id ?? null,
      tool_call_id: context.tool_call_id ?? null,
      capability_identity: context.capability_identity ?? null,
      authority_posture: context.authority_posture ?? null,
      admission_evidence: context.admission_evidence ?? null,
      execution_evidence: context.execution_evidence ?? null,
      result_reference: context.result_reference ?? null,
      reconciliation_state: context.reconciliation_state ?? null,
    },
  };
}

export function isNativePiToolName(name) {
  const normalized = String(name ?? '').trim().toLowerCase();
  return NATIVE_TOOL_NAMES.has(normalized)
    || normalized.includes('shell')
    || normalized.includes('filesystem')
    || normalized === 'mutate';
}

export function normalizeNarsGatewayTool(tool) {
  const name = toolName(tool);
  if (!name) throw new NarsKernelContractError('pi_gateway_tool_name_required', 'NARS gateway tools require a name.');
  const sourceShape = tool && typeof tool === 'object' ? tool : {};
  const functionShape = sourceShape.function && typeof sourceShape.function === 'object'
    ? sourceShape.function
    : sourceShape;
  if (sourceShape.native === true
    || functionShape.native === true
    || sourceShape.source === 'ambient'
    || functionShape.source === 'ambient'
    || sourceShape.nars_gateway_proxy === false
    || functionShape.nars_gateway_proxy === false) {
    throw new NarsKernelContractError(
      'pi_native_tool_forbidden',
      `Pi tool '${name}' is not an explicit NARS capability-gateway proxy.`,
    );
  }
  if (sourceShape.nars_gateway_proxy !== true && functionShape.nars_gateway_proxy !== true) {
    throw new NarsKernelContractError(
      'pi_gateway_proxy_marker_required',
      `Pi tool '${name}' must carry an explicit nars_gateway_proxy:true marker.`,
    );
  }
  if (isNativePiToolName(name)) throw new NarsKernelContractError('pi_native_tool_forbidden', `Native Pi tool '${name}' is not admissible.`);
  const parameters = functionShape.parameters ?? functionShape.input_schema ?? { type: 'object', properties: {} };
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw new NarsKernelContractError('pi_gateway_tool_schema_invalid', `Pi tool '${name}' has an invalid input schema.`);
  }
  const normalized = {
    type: 'function',
    function: {
      name,
      description: typeof functionShape.description === 'string' ? functionShape.description : undefined,
      parameters,
    },
    nars_gateway_proxy: true,
  };
  const capabilityIdentity = functionShape.capability_identity ?? functionShape.capabilityIdentity ?? tool.capability_identity ?? tool.capabilityIdentity;
  const authorityPosture = functionShape.authority_posture ?? functionShape.authorityPosture ?? tool.authority_posture ?? tool.authorityPosture;
  if (typeof capabilityIdentity === 'string' && capabilityIdentity.trim()) normalized.capability_identity = capabilityIdentity.trim();
  if (typeof authorityPosture === 'string' && authorityPosture.trim()) normalized.authority_posture = authorityPosture.trim();
  return Object.freeze(normalized);
}

/**
 * A Pi-visible tool surface. Every execution reattaches the NARS correlation
 * and authority context; Pi success is explicitly not effect confirmation.
 */
export function createNarsPiCapabilityGateway({
  gateway,
  context = {},
  eventSink = async () => {},
  onCorrelation = null,
} = {}) {
  const invokeCapability = typeof gateway?.invoke === 'function'
    ? gateway.invoke.bind(gateway)
    : typeof gateway?.execute === 'function'
      ? gateway.execute.bind(gateway)
      : null;
  if (!invokeCapability) {
    throw new NarsKernelContractError('pi_capability_gateway_required', 'Pi kernel requires a NARS capability gateway.');
  }
  const contextSnapshot = Object.freeze({
    agent_id: context.agent_id ?? context.agentId ?? null,
    session_id: context.session_id ?? context.sessionId ?? null,
    turn_id: context.turn_id ?? context.turnId ?? null,
    input_id: context.input_id ?? context.inputId ?? context.input_event_id ?? context.inputEventId ?? null,
    runtime_request_id: context.runtime_request_id ?? context.runtimeRequestId ?? null,
    idempotency_key: context.idempotency_key ?? context.idempotencyKey ?? null,
    turn_attempt: context.turn_attempt ?? context.turnAttempt ?? null,
    authority_posture: context.authority_posture ?? 'nars-admitted',
    admission_evidence: context.admission_evidence ?? null,
    execution_evidence: context.execution_evidence ?? null,
    result_reference: context.result_reference ?? context.resultReference ?? null,
    reconciliation_state: context.reconciliation_state ?? context.reconciliationState ?? null,
    correlation_key: context.correlation_key ?? context.correlationKey ?? null,
  });
  let admittedCatalogNames = null;
  const api = {
    async listTools() {
      const catalog = typeof gateway.toolCatalog === 'function' ? await gateway.toolCatalog() : [];
      if (!Array.isArray(catalog)) {
        throw new NarsKernelContractError(
          'pi_gateway_catalog_invalid',
          'The NARS capability gateway must return an array tool catalog.',
        );
      }
      const normalizedTools = catalog.map(normalizeNarsGatewayTool);
      const names = new Set();
      for (const tool of normalizedTools) {
        const name = tool.function.name;
        if (names.has(name)) {
          throw new NarsKernelContractError(
            'pi_gateway_catalog_duplicate_tool',
            `The NARS capability gateway catalog contains duplicate tool '${name}'.`,
          );
        }
        names.add(name);
      }
      const normalized = Object.freeze(normalizedTools);
      admittedCatalogNames = new Set(normalized.map((tool) => tool.function.name));
      return normalized;
    },
    async execute(request = {}) {
      const name = toolName(request);
      const toolCallId = request.tool_call_id ?? request.toolCallId ?? null;
      const invocationContext = {
        ...contextSnapshot,
        tool_call_id: toolCallId,
        capability_identity: request.capability_identity ?? request.capabilityIdentity ?? `capability:${name}`,
        input_id: request.input_id ?? request.inputId ?? request.input_event_id ?? request.inputEventId ?? contextSnapshot.input_id,
        runtime_request_id: request.runtime_request_id ?? request.runtimeRequestId ?? contextSnapshot.runtime_request_id,
        idempotency_key: request.idempotency_key ?? request.idempotencyKey ?? contextSnapshot.idempotency_key,
        turn_attempt: request.turn_attempt ?? request.turnAttempt ?? contextSnapshot.turn_attempt,
        admission_evidence: request.admission_evidence ?? request.admissionEvidence ?? contextSnapshot.admission_evidence,
        execution_evidence: request.execution_evidence ?? request.executionEvidence ?? contextSnapshot.execution_evidence,
        result_reference: request.result_reference ?? request.resultReference ?? contextSnapshot.result_reference,
        reconciliation_state: request.reconciliation_state ?? request.reconciliationState ?? contextSnapshot.reconciliation_state,
        correlation_key: contextSnapshot.correlation_key,
      };
      if (!name || isNativePiToolName(name)) {
        const denied = refusal(name, 'native_pi_tool_not_admitted', invocationContext);
        await eventSink({
          kind: 'pi_tool_proxy_refused',
          tool_name: name || null,
          tool_call_id: toolCallId,
          admission_reason: denied.admission_reason,
          context: invocationContext,
        });
        return denied;
      }
      if (admittedCatalogNames == null) {
        try {
          await api.listTools();
        } catch (error) {
          const unknown = gatewayFailure(name, 'gateway_catalog_unavailable', error, invocationContext);
          await eventSink({ kind: 'pi_tool_proxy_result_observed', tool_name: name, tool_call_id: toolCallId, status: unknown.status, effect_confirmation: unknown.effect_confirmation });
          return unknown;
        }
      }
      if (!admittedCatalogNames.has(name)) {
        const denied = refusal(name, 'tool_not_in_admitted_catalog', invocationContext);
        await eventSink({ kind: 'pi_tool_proxy_refused', tool_name: name, tool_call_id: toolCallId, admission_reason: denied.admission_reason, context: invocationContext });
        return denied;
      }
      await eventSink({
        kind: 'pi_tool_proxy_requested',
        tool_name: name,
        tool_call_id: toolCallId,
        context: invocationContext,
      });
      // The Pi host owns the disposable tool loop, but NARS still owns the
      // canonical carrier lifecycle. Keep the Pi-specific observation and
      // emit the same durable tool boundary used by the native carrier so
      // session-core and every client projection remain substitutable.
      await eventSink({
        kind: 'carrier_tool_requested',
        tool_name: name,
        tool_call_id: toolCallId,
        turn_id: invocationContext.turn_id,
        input_event_id: invocationContext.input_id,
        capability_identity: invocationContext.capability_identity,
        authority_posture: invocationContext.authority_posture,
        admission_evidence: invocationContext.admission_evidence,
      });
      onCorrelation?.({
        pi_tool_call_id: toolCallId,
        pi_message_id: request.pi_message_id ?? request.piMessageId ?? null,
      });
      let result;
      try {
        result = await invokeCapability({
          toolName: name,
          tool_name: name,
          arguments: request.arguments ?? request.input ?? {},
          abortSignal: request.abortSignal ?? null,
          turnId: invocationContext.turn_id,
          turn_id: invocationContext.turn_id,
          inputEventId: request.input_event_id ?? request.inputEventId ?? invocationContext.input_id ?? null,
          input_event_id: request.input_event_id ?? request.inputEventId ?? invocationContext.input_id ?? null,
          toolCallId: toolCallId,
          tool_call_id: toolCallId,
          agentId: invocationContext.agent_id,
          agent_id: invocationContext.agent_id,
          sessionId: invocationContext.session_id,
          session_id: invocationContext.session_id,
          inputId: invocationContext.input_id,
          input_id: invocationContext.input_id,
          runtimeRequestId: invocationContext.runtime_request_id,
          runtime_request_id: invocationContext.runtime_request_id,
          idempotencyKey: invocationContext.idempotency_key,
          idempotency_key: invocationContext.idempotency_key,
          turnAttempt: invocationContext.turn_attempt,
          turn_attempt: invocationContext.turn_attempt,
          capabilityIdentity: invocationContext.capability_identity,
          capability_identity: invocationContext.capability_identity,
          authorityPosture: invocationContext.authority_posture,
          authority_posture: invocationContext.authority_posture,
          admissionEvidence: invocationContext.admission_evidence,
          admission_evidence: invocationContext.admission_evidence,
          executionEvidence: invocationContext.execution_evidence,
          execution_evidence: invocationContext.execution_evidence,
          resultReference: invocationContext.result_reference,
          result_reference: invocationContext.result_reference,
          reconciliationState: invocationContext.reconciliation_state,
          reconciliation_state: invocationContext.reconciliation_state,
          piMessageId: request.pi_message_id ?? request.piMessageId ?? null,
          pi_message_id: request.pi_message_id ?? request.piMessageId ?? null,
          correlationKey: invocationContext.correlation_key,
          correlation_key: invocationContext.correlation_key,
        });
      } catch (error) {
        result = gatewayFailure(name, 'gateway_execution_unknown', error, invocationContext);
      }
      const projected = {
        ...(result && typeof result === 'object' ? result : { status: 'failed', result }),
        schema: 'narada.nars.pi.tool-proxy-result.v1',
        tool_name: name,
        tool_call_id: toolCallId,
        effect_confirmation: result?.effect_confirmation ?? (result?.status === 'unknown' ? 'unknown' : 'not-confirmed'),
        context: invocationContext,
        correlation_key: invocationContext.correlation_key,
        admission_evidence: result?.admission_evidence ?? invocationContext.admission_evidence ?? null,
        execution_evidence: result?.execution_evidence ?? null,
        result_reference: result?.result_reference ?? result?.result_ref ?? null,
        reconciliation_state: result?.reconciliation_state ?? null,
      };
      await eventSink({
        kind: 'pi_tool_proxy_result_observed',
        tool_name: name,
        tool_call_id: toolCallId,
        status: projected.status ?? 'unknown',
        effect_confirmation: projected.effect_confirmation,
      });
      await eventSink({
        kind: 'carrier_tool_completed',
        tool_name: name,
        tool_call_id: toolCallId,
        turn_id: invocationContext.turn_id,
        input_event_id: invocationContext.input_id,
        status: projected.status ?? 'unknown',
        effect_confirmation: projected.effect_confirmation,
        capability_identity: invocationContext.capability_identity,
        authority_posture: invocationContext.authority_posture,
        admission_evidence: projected.admission_evidence,
        execution_evidence: projected.execution_evidence,
        result_reference: projected.result_reference,
        reconciliation_state: projected.reconciliation_state,
      });
      return projected;
    },
    close: () => gateway.close?.(),
  };
  // Keep the gateway shape understood by the shared carrier and by injected
  // Pi SDK sessions. `execute` remains the descriptive SDK-facing name; the
  // aliases do not create another authority boundary.
  api.invoke = api.execute;
  api.toolCatalog = api.listTools;
  return Object.freeze(api);
}

export function createPiGatewayToolProxies({ tools = [], gateway = null, context = {}, eventSink } = {}) {
  if (gateway) return createNarsPiCapabilityGateway({ gateway, context, eventSink });
  const normalized = tools.map(normalizeNarsGatewayTool);
  return Object.freeze({
    async listTools() { return normalized; },
    async execute(request = {}) {
      const name = toolName(request);
      if (!normalized.some((tool) => tool.function.name === name)) return refusal(name, 'tool_not_in_admitted_catalog', context);
      return refusal(name, 'tool_gateway_not_bound', context);
    },
  });
}

export { NATIVE_TOOL_NAMES };
