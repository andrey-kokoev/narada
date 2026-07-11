import {
  NARS_AFFORDANCE_ACTION_EVENTS,
  NARS_AFFORDANCE_ACTION_POSTURES,
  NARS_AFFORDANCE_ACTION_REFUSAL_CODES,
  buildNarsAffordanceActionConfirmationRequiredEvent,
  buildNarsAffordanceActionConfirmedEvent,
  buildNarsAffordanceActionCancelledEvent,
  buildNarsAffordanceActionFailureEvent,
  buildNarsAffordanceActionRefusalEvent,
  buildNarsAffordanceActionRequestedEvent,
  buildNarsAffordanceActionResultEvent,
} from '@narada2/nars-client-projection-contract';
import { sendMcpRequest } from './mcp-runtime.mjs';
import { buildNarsSurfaceAffordanceProjection } from './surface-affordances.mjs';
import {
  ADMITTED_INTELLIGENCE_PROVIDERS,
  hasConfiguredIntelligenceProviderAuth,
  isAdmittedIntelligenceProvider,
  normalizeIntelligenceProvider,
} from './intelligence-provider-policy.mjs';
import { parseJson, randomId } from './runtime-tail-utils.mjs';

export async function serverAffordanceActionRequest({ requestId, params = {}, context = {} }) {
  const surfaceId = stringValue(params.surface_id) ?? stringValue(params.surfaceId);
  const actionId = stringValue(params.action_id) ?? stringValue(params.actionId);
  const clientCorrelationId = stringValue(params.client_correlation_id) ?? stringValue(params.clientCorrelationId);
  const args = objectValue(params.args) ?? {};
  const requested = buildNarsAffordanceActionRequestedEvent({
    requestId,
    surfaceId,
    actionId,
    clientCorrelationId,
  });
  context.emit(NARS_AFFORDANCE_ACTION_EVENTS.requested, requested);
  context.appendSessionRecord?.({ ...requested, operation_status: 'requested', requested_at: new Date().toISOString() });
  if (!surfaceId || !actionId) {
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.requiredIdentity, message: 'session.affordance.action.request requires params.surface_id and params.action_id.' });
  }

  const projection = buildNarsSurfaceAffordanceProjection({
    mcpServers: context.mcpServers ?? {},
    intelligence: context.effectiveIntelligence?.() ?? {},
  });
  const surface = projection.items.find((item) => item.surface_id === surfaceId) ?? null;
  if (!surface) {
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.surfaceNotFound, message: `No live surface affordance was found for ${surfaceId}.` });
  }
  const action = findAffordanceAction(surface, actionId);
  if (!action) {
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.actionNotFound, message: `No live affordance action was found for ${surfaceId}/${actionId}.`, serverName: surface.server_name });
  }
  const target = objectValue(action.target);
  if (target?.kind !== 'tool') {
    if (target?.kind !== 'runtime') {
      return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.targetNotExecutable, message: 'Only tool-target and runtime-target affordance actions can execute through this boundary.', serverName: surface.server_name });
    }
  }
  const posture = classifyAffordanceActionPosture(action);
  if (posture !== NARS_AFFORDANCE_ACTION_POSTURES.readOnlyOrIdempotent) {
    if (posture === NARS_AFFORDANCE_ACTION_POSTURES.confirmationRequired) {
      const confirmationId = `affordance-confirm-${randomId()}`;
      pendingAffordanceConfirmations(context).set(confirmationId, {
        confirmation_id: confirmationId,
        request_id: requestId,
        surface_id: surfaceId,
        action_id: actionId,
        client_correlation_id: clientCorrelationId,
        server_name: surface.server_name,
        action,
        target,
        args,
        created_at: new Date().toISOString(),
      });
      const event = buildNarsAffordanceActionConfirmationRequiredEvent({
        requestId,
        surfaceId,
        actionId,
        clientCorrelationId,
        code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.confirmationRequired,
        message: 'This affordance action requires explicit confirmation before execution.',
        serverName: surface.server_name,
        posture,
        confirmationId,
      });
      context.appendSessionRecord?.({ ...event, operation_status: 'awaiting_confirmation', requested_at: new Date().toISOString() });
      return event;
    }
    const options = {
      requestId,
      surfaceId,
      actionId,
      clientCorrelationId,
      code: posture === NARS_AFFORDANCE_ACTION_POSTURES.confirmationRequired ? NARS_AFFORDANCE_ACTION_REFUSAL_CODES.confirmationRequired : NARS_AFFORDANCE_ACTION_REFUSAL_CODES.notReadOnly,
      message: posture === NARS_AFFORDANCE_ACTION_POSTURES.confirmationRequired
        ? 'This affordance action requires an explicit confirmation flow before execution.'
        : 'This affordance action is not declared read-only or idempotent, so runtime refused execution.',
      serverName: surface.server_name,
      posture,
    };
    return affordanceActionRefusal(options);
  }
  return executeAffordanceAction({ requestId, surfaceId, actionId, clientCorrelationId, serverName: surface.server_name, action, target, args, context });
}

export async function serverAffordanceActionConfirm({ requestId, params = {}, context = {} }) {
  const confirmationId = stringValue(params.confirmation_id) ?? stringValue(params.confirmationId);
  const pending = confirmationId ? pendingAffordanceConfirmations(context).get(confirmationId) ?? null : null;
  if (!confirmationId || !pending) {
    return affordanceActionRefusal({
      requestId,
      surfaceId: null,
      actionId: null,
      code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.confirmationNotFound,
      message: confirmationId
        ? `No pending affordance action confirmation was found for ${confirmationId}.`
        : 'session.affordance.action.confirm requires params.confirmation_id.',
    });
  }
  pendingAffordanceConfirmations(context).delete(confirmationId);
  const confirmed = buildNarsAffordanceActionConfirmedEvent({
    requestId,
    confirmationId,
    surfaceId: pending.surface_id,
    actionId: pending.action_id,
  });
  context.emit?.(NARS_AFFORDANCE_ACTION_EVENTS.confirmed, confirmed);
  context.appendSessionRecord?.({ ...confirmed, completed_at: new Date().toISOString() });
  return executeAffordanceAction({
    requestId,
    surfaceId: pending.surface_id,
    actionId: pending.action_id,
    clientCorrelationId: pending.client_correlation_id,
    serverName: pending.server_name,
    action: pending.action,
    target: pending.target,
    args: pending.args,
    context,
    confirmationId,
  });
}

export function serverAffordanceActionCancel({ requestId, params = {}, context = {} }) {
  const confirmationId = stringValue(params.confirmation_id) ?? stringValue(params.confirmationId);
  const pending = confirmationId ? pendingAffordanceConfirmations(context).get(confirmationId) ?? null : null;
  if (!confirmationId || !pending) {
    return affordanceActionRefusal({
      requestId,
      surfaceId: null,
      actionId: null,
      code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.confirmationNotFound,
      message: confirmationId
        ? `No pending affordance action confirmation was found for ${confirmationId}.`
        : 'session.affordance.action.cancel requires params.confirmation_id.',
    });
  }
  pendingAffordanceConfirmations(context).delete(confirmationId);
  const event = buildNarsAffordanceActionCancelledEvent({
    requestId,
    confirmationId,
    surfaceId: pending.surface_id,
    actionId: pending.action_id,
    reason: stringValue(params.reason) ?? 'operator_cancelled',
  });
  context.appendSessionRecord?.({ ...event, completed_at: new Date().toISOString() });
  return event;
}

async function executeAffordanceAction({ requestId, surfaceId, actionId, clientCorrelationId = null, serverName = null, action, target, args = {}, context = {}, confirmationId = null }) {
  if (target?.kind === 'runtime') {
    return executeRuntimeAffordanceAction({ requestId, surfaceId, actionId, clientCorrelationId, target, args, context, confirmationId });
  }
  const server = context.mcpServers?.[serverName] ?? null;
  if (!server) {
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.serverUnavailable, message: `MCP server ${serverName ?? '<unknown>'} is not available.`, serverName });
  }
  const toolName = stringValue(target.tool);
  const toolNames = new Set((server.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  if (!toolName || !toolNames.has(toolName)) {
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.toolUnavailable, message: `Tool target ${toolName ?? '<missing>'} is not available on ${serverName}.`, serverName, toolName });
  }
  try {
    const result = await sendMcpRequest(server, { jsonrpc: '2.0', id: randomId(), method: 'tools/call', params: { name: toolName, arguments: args } });
    const event = buildNarsAffordanceActionResultEvent({
      requestId,
      surfaceId,
      actionId,
      serverName,
      toolName,
      clientCorrelationId,
      result: result.structuredContent ?? parseJson(result.content?.[0]?.text ?? '') ?? result,
    });
    if (confirmationId) event.confirmation_id = confirmationId;
    context.appendSessionRecord?.({ ...event, completed_at: new Date().toISOString() });
    return event;
  } catch (error) {
    const event = buildNarsAffordanceActionFailureEvent({ requestId, surfaceId, actionId, serverName, toolName, clientCorrelationId, error });
    if (confirmationId) event.confirmation_id = confirmationId;
    context.appendSessionRecord?.({ ...event, completed_at: new Date().toISOString() });
    return event;
  }
}

export function executeRuntimeAffordanceAction({ requestId, surfaceId, actionId, clientCorrelationId = null, target, args = {}, context = {}, confirmationId = null }) {
  const operation = stringValue(target.operation);
  const sessionSettings = context.state?.sessionSettings;
  if (!sessionSettings) {
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.serverUnavailable, message: 'Runtime session settings are not available for this affordance action.' });
  }
  const currentProvider = normalizeIntelligenceProvider(sessionSettings.provider) ?? normalizeIntelligenceProvider(context.providerSettings?.provider) ?? normalizeIntelligenceProvider(process.env.NARADA_INTELLIGENCE_PROVIDER) ?? 'codex-subscription';
  if (operation === 'set_model') {
    const model = stringValue(args.model) ?? stringValue(args.value);
    if (!model) {
      return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.requiredIdentity, message: 'set_model requires args.model.' });
    }
    sessionSettings.model = model;
  } else if (operation === 'set_provider') {
    const provider = normalizeIntelligenceProvider(stringValue(args.provider) ?? stringValue(args.value));
    if (!provider) {
      return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.requiredIdentity, message: 'set_provider requires args.provider.' });
    }
    if (provider !== currentProvider) {
      if (!isAdmittedIntelligenceProvider(provider)) {
        return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.targetNotExecutable, message: `Provider ${provider} is not admitted for this runtime.` });
      }
      if (!hasConfiguredIntelligenceProviderAuth(provider, context.env ?? process.env)) {
        return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.targetNotExecutable, message: `Provider ${provider} is admitted but required auth is not configured.` });
      }
      sessionSettings.provider = provider;
    }
  } else if (operation === 'set_thinking') {
    sessionSettings.thinking = normalizeThinkingLevel(stringValue(args.thinking) ?? stringValue(args.value));
  } else {
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.actionNotFound, message: `Unsupported runtime affordance operation: ${operation ?? '<missing>'}.` });
  }
  const result = {
    status: 'ok',
    operation,
    intelligence: {
      provider: stringValue(sessionSettings.provider) ?? stringValue(context.providerSettings?.provider) ?? currentProvider,
      model: stringValue(sessionSettings.model) ?? stringValue(context.providerSettings?.model),
      available_models: stringArray(context.providerSettings?.availableModels ?? context.providerSettings?.available_models),
      available_providers: stringArray(context.providerSettings?.availableProviders ?? context.providerSettings?.available_providers ?? ADMITTED_INTELLIGENCE_PROVIDERS),
      thinking: stringValue(sessionSettings.thinking) ?? stringValue(context.providerSettings?.thinking) ?? 'medium',
      stream: typeof sessionSettings.stream === 'boolean' ? sessionSettings.stream : typeof context.providerSettings?.stream === 'boolean' ? context.providerSettings.stream : null,
    },
  };
  const event = buildNarsAffordanceActionResultEvent({
    requestId,
    surfaceId,
    actionId,
    serverName: null,
    toolName: null,
    clientCorrelationId,
    result,
  });
  if (confirmationId) event.confirmation_id = confirmationId;
  context.appendSessionRecord?.({ ...event, completed_at: new Date().toISOString() });
  return event;
}

function normalizeThinkingLevel(value) {
  const normalized = String(value ?? 'medium').trim().toLowerCase();
  if (['none', 'low', 'medium', 'high', 'xhigh'].includes(normalized)) return normalized;
  return 'medium';
}

function findAffordanceAction(surface, actionId) {
  const document = objectValue(surface?.affordance_document);
  const documentAction = arrayOfObjects(document?.actions).find((action) => stringValue(action.id) === actionId);
  if (documentAction) return documentAction;
  return null;
}

function classifyAffordanceActionPosture(action) {
  if (booleanValue(action.confirmation_required) || booleanValue(action.requires_confirmation)) return NARS_AFFORDANCE_ACTION_POSTURES.confirmationRequired;
  if (booleanValue(action.destructive) || stringValue(action.danger_level) === 'high') return NARS_AFFORDANCE_ACTION_POSTURES.unsafe;
  if (booleanValue(action.read_only) || booleanValue(action.idempotent)) return NARS_AFFORDANCE_ACTION_POSTURES.readOnlyOrIdempotent;
  return NARS_AFFORDANCE_ACTION_POSTURES.unsafe;
}

function affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId = null, code, message, serverName = null, toolName = null, posture = null }) {
  return buildNarsAffordanceActionRefusalEvent({ requestId, surfaceId, actionId, clientCorrelationId, code, message, serverName, toolName, posture });
}

function pendingAffordanceConfirmations(context = {}) {
  if (!context.state) context.state = {};
  if (!(context.state.affordanceActionConfirmations instanceof Map)) {
    context.state.affordanceActionConfirmations = new Map();
  }
  return context.state.affordanceActionConfirmations;
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function arrayOfObjects(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

function booleanValue(value) {
  return value === true;
}

function stringValue(value) {
  return typeof value === 'string' && value ? value : null;
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item) : [];
}
