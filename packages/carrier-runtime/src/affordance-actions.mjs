import { sendMcpRequest } from './mcp-runtime.mjs';
import { buildMcpSurfaceAffordanceProjection } from './surface-affordances.mjs';
import { parseJson, randomId } from './runtime-tail-utils.mjs';

export async function serverAffordanceActionRequest({ requestId, params = {}, context = {} }) {
  const surfaceId = stringValue(params.surface_id) ?? stringValue(params.surfaceId);
  const actionId = stringValue(params.action_id) ?? stringValue(params.actionId);
  const clientCorrelationId = stringValue(params.client_correlation_id) ?? stringValue(params.clientCorrelationId);
  const args = objectValue(params.args) ?? {};
  const requested = {
    schema: 'narada.nars.affordance_action_request.v1',
    event: 'session_affordance_action_requested',
    request_id: requestId,
    transport: 'jsonl_stdio',
    surface_id: surfaceId,
    action_id: actionId,
    client_correlation_id: clientCorrelationId,
  };
  context.emit('session_affordance_action_requested', requested);
  context.appendSessionRecord?.({ ...requested, operation_status: 'requested', requested_at: new Date().toISOString() });
  if (!surfaceId || !actionId) {
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: 'surface_id_and_action_id_required', message: 'session.affordance.action.request requires params.surface_id and params.action_id.' });
  }

  const projection = buildMcpSurfaceAffordanceProjection(context.mcpServers ?? {});
  const surface = projection.items.find((item) => item.surface_id === surfaceId) ?? null;
  if (!surface) {
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: 'surface_affordance_not_found', message: `No live surface affordance was found for ${surfaceId}.` });
  }
  const action = findAffordanceAction(surface, actionId);
  if (!action) {
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: 'surface_affordance_action_not_found', message: `No live affordance action was found for ${surfaceId}/${actionId}.`, serverName: surface.server_name });
  }
  const target = objectValue(action.target);
  if (target?.kind !== 'tool') {
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: 'affordance_action_target_not_executable', message: 'Only tool-target affordance actions can execute through this boundary.', serverName: surface.server_name });
  }
  const posture = classifyAffordanceActionPosture(action);
  if (posture !== 'read_only_or_idempotent') {
    const event = affordanceActionRefusal({
      requestId,
      surfaceId,
      actionId,
      clientCorrelationId,
      code: posture === 'confirmation_required' ? 'affordance_action_confirmation_required' : 'affordance_action_not_read_only',
      message: posture === 'confirmation_required'
        ? 'This affordance action requires an explicit confirmation flow before execution.'
        : 'This affordance action is not declared read-only or idempotent, so runtime refused execution.',
      serverName: surface.server_name,
      posture,
    });
    event.event = posture === 'confirmation_required' ? 'session_affordance_confirmation_required' : event.event;
    event.schema = posture === 'confirmation_required' ? 'narada.nars.affordance_action_confirmation_required.v1' : event.schema;
    return event;
  }
  const serverName = surface.server_name;
  const server = context.mcpServers?.[serverName] ?? null;
  if (!server) {
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: 'surface_mcp_server_unavailable', message: `MCP server ${serverName ?? '<unknown>'} is not available.`, serverName });
  }
  const toolName = stringValue(target.tool);
  const toolNames = new Set((server.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  if (!toolName || !toolNames.has(toolName)) {
    return affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId, code: 'surface_affordance_tool_unavailable', message: `Tool target ${toolName ?? '<missing>'} is not available on ${serverName}.`, serverName, toolName });
  }
  try {
    const result = await sendMcpRequest(server, { jsonrpc: '2.0', id: randomId(), method: 'tools/call', params: { name: toolName, arguments: args } });
    const event = {
      schema: 'narada.nars.affordance_action_result.v1',
      event: 'session_affordance_action_result',
      request_id: requestId,
      transport: 'jsonl_stdio',
      terminal_state: 'completed',
      status: 'ok',
      surface_id: surfaceId,
      action_id: actionId,
      server_name: serverName,
      tool_name: toolName,
      client_correlation_id: clientCorrelationId,
      result: result.structuredContent ?? parseJson(result.content?.[0]?.text ?? '') ?? result,
    };
    context.appendSessionRecord?.({ ...event, completed_at: new Date().toISOString() });
    return event;
  } catch (error) {
    const event = {
      schema: 'narada.nars.affordance_action_result.v1',
      event: 'session_affordance_action_result',
      request_id: requestId,
      transport: 'jsonl_stdio',
      terminal_state: 'failed',
      status: 'error',
      surface_id: surfaceId,
      action_id: actionId,
      server_name: serverName,
      tool_name: toolName,
      client_correlation_id: clientCorrelationId,
      error: error instanceof Error ? error.message : String(error),
    };
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
  if (booleanValue(action.confirmation_required) || booleanValue(action.requires_confirmation)) return 'confirmation_required';
  if (booleanValue(action.destructive) || stringValue(action.danger_level) === 'high') return 'unsafe';
  if (booleanValue(action.read_only) || booleanValue(action.idempotent)) return 'read_only_or_idempotent';
  return 'unsafe';
}

function affordanceActionRefusal({ requestId, surfaceId, actionId, clientCorrelationId = null, code, message, serverName = null, toolName = null, posture = null }) {
  return {
    schema: 'narada.nars.affordance_action_refusal.v1',
    event: 'session_affordance_action_refused',
    request_id: requestId,
    transport: 'jsonl_stdio',
    terminal_state: 'refused',
    status: 'refused',
    surface_id: surfaceId,
    action_id: actionId,
    server_name: serverName,
    tool_name: toolName,
    client_correlation_id: clientCorrelationId,
    code,
    message,
    ...(posture ? { posture } : {}),
  };
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
