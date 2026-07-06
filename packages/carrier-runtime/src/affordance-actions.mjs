import {
  NARS_AFFORDANCE_ACTION_EVENTS,
  NARS_AFFORDANCE_ACTION_POSTURES,
  NARS_AFFORDANCE_ACTION_REFUSAL_CODES,
  buildNarsAffordanceActionConfirmationRequiredEvent,
  buildNarsAffordanceActionFailureEvent,
  buildNarsAffordanceActionRefusalEvent,
  buildNarsAffordanceActionRequestedEvent,
  buildNarsAffordanceActionResultEvent,
} from '@narada2/nars-client-projection-contract';
import { sendMcpRequest } from './mcp-runtime.mjs';
import { buildMcpSurfaceAffordanceProjection } from './surface-affordances.mjs';
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

  const projection = buildMcpSurfaceAffordanceProjection(context.mcpServers ?? {});
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
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: NARS_AFFORDANCE_ACTION_REFUSAL_CODES.targetNotExecutable, message: 'Only tool-target affordance actions can execute through this boundary.', serverName: surface.server_name });
  }
  const posture = classifyAffordanceActionPosture(action);
  if (posture !== NARS_AFFORDANCE_ACTION_POSTURES.readOnlyOrIdempotent) {
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
    return posture === NARS_AFFORDANCE_ACTION_POSTURES.confirmationRequired
      ? buildNarsAffordanceActionConfirmationRequiredEvent(options)
      : affordanceActionRefusal(options);
  }
  const serverName = surface.server_name;
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
    context.appendSessionRecord?.({ ...event, completed_at: new Date().toISOString() });
    return event;
  } catch (error) {
    const event = buildNarsAffordanceActionFailureEvent({ requestId, surfaceId, actionId, serverName, toolName, clientCorrelationId, error });
    context.appendSessionRecord?.({ ...event, completed_at: new Date().toISOString() });
    return event;
  }
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
