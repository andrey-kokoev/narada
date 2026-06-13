#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VALID_OPERATIONS = new Set([
  'site.list',
  'site.read',
  'operation.list',
  'operation.read',
  'webhook_delay.directive.dual_record.list',
  'webhook_delay.directive.primary_with_fallback.list',
  'webhook_delay.shadow_read.list',
  'site_file_change_proposal.list',
  'resident_dispatch.windows_fallback_evidence.list',
  'mailbox.outlook_draft.list',
  'mailbox.draft_reply_proposal.list',
  'site_file_materialization.list',
  'task_lifecycle.task.list',
  'mailbox.send_accepted.list',
  'mailbox.send_confirmation.list',
  'local_ingress.request.list',
  'local_ingress.evidence.list',
  'local_ingress.provider_heartbeat.list',
  'repository_publication.provider_heartbeat.list',
]);

export function parseProductReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const positional = positionalArgs(args);
  const operation = option(args, '--operation') ?? positional[0] ?? env.CLOUDFLARE_CARRIER_PRODUCT_OPERATION ?? 'site.list';
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operationId = option(args, '--carrier-operation') ?? option(args, '--operation-id') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const limit = parseOptionalInteger(option(args, '--limit') ?? env.CLOUDFLARE_CARRIER_PRODUCT_LIMIT ?? null, 'limit');
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_PRODUCT_FORMAT ?? 'json';
  const continuation = flag(args, '--continuation') || parseBoolean(env.CLOUDFLARE_CARRIER_PRODUCT_CONTINUATION ?? '');
  const requestId = option(args, '--request-id') ?? `product_read_${operation.replace(/[^a-z0-9]+/gi, '_')}_${Date.now()}`;
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('product_read_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!VALID_OPERATIONS.has(operation)) throw new Error(`product_read_operation_unsupported:${operation}`);
  if (!['json', 'summary', 'text'].includes(format)) throw new Error(`product_read_format_unsupported:${format}`);
  if ((operation === 'site.read'
    || operation === 'operation.list'
    || operation === 'operation.read'
    || operation === 'webhook_delay.directive.dual_record.list'
    || operation === 'webhook_delay.directive.primary_with_fallback.list'
    || operation === 'webhook_delay.shadow_read.list'
    || operation === 'site_file_change_proposal.list'
    || operation === 'resident_dispatch.windows_fallback_evidence.list'
    || operation === 'mailbox.outlook_draft.list'
    || operation === 'mailbox.draft_reply_proposal.list'
    || operation === 'site_file_materialization.list'
    || operation === 'task_lifecycle.task.list'
    || operation === 'mailbox.send_accepted.list'
    || operation === 'mailbox.send_confirmation.list'
    || operation === 'local_ingress.request.list'
    || operation === 'local_ingress.evidence.list'
    || operation === 'local_ingress.provider_heartbeat.list'
    || operation === 'repository_publication.provider_heartbeat.list') && !siteId) throw new Error(`product_read_${operation}_requires_--site`);
  if (operation === 'operation.read' && !operationId) throw new Error('product_read_operation.read_requires_--operation-id_or_--carrier-operation');
  if (continuation && operation !== 'operation.list') throw new Error('product_read_continuation_requires_operation.list');
  if (!auth) throw new Error('product_read_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    operation,
    requestId,
    params: buildParams({ operation, siteId, operationId, limit }),
    format,
    continuation,
    auth,
  };
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

export function buildParams({ operation, siteId, operationId, limit }) {
  const params = {};
  if (operation === 'site.read'
    || operation === 'operation.list'
    || operation === 'operation.read'
    || operation === 'webhook_delay.directive.dual_record.list'
    || operation === 'webhook_delay.directive.primary_with_fallback.list'
    || operation === 'webhook_delay.shadow_read.list'
    || operation === 'site_file_change_proposal.list'
    || operation === 'resident_dispatch.windows_fallback_evidence.list'
    || operation === 'mailbox.outlook_draft.list'
    || operation === 'mailbox.draft_reply_proposal.list'
    || operation === 'site_file_materialization.list'
    || operation === 'task_lifecycle.task.list'
    || operation === 'mailbox.send_accepted.list'
    || operation === 'mailbox.send_confirmation.list'
    || operation === 'local_ingress.request.list'
    || operation === 'local_ingress.evidence.list'
    || operation === 'local_ingress.provider_heartbeat.list'
    || operation === 'repository_publication.provider_heartbeat.list') params.site_id = siteId;
  if (operation === 'operation.read') params.operation_id = operationId;
  if (Number.isInteger(limit)) params.limit = limit;
  return params;
}

export async function readProductSurface(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: config.operation,
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`product_read_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeProductReadFailure(config.operation, body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.product_read.v1',
    status: 'ok',
    operation: config.operation,
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: config.params,
    response: body,
    summary: summarizeProductSurface(config.operation, body, { continuation: config.continuation === true }),
  };
}

export function summarizeProductSurface(operation, body, options = {}) {
  if (operation === 'site.list') {
    const overview = body?.site_product_overview ?? {};
    const sitePostureRoute = body?.site_posture_route ?? null;
    return {
      operation,
      site_count: overview.site_count ?? body?.sites?.length ?? 0,
      next_site_id: overview.next_site_id ?? null,
      next_health: overview.next_health ?? null,
      next_action: overview.next_action ?? null,
      next_reason: overview.next_reason ?? null,
      health_counts: overview.health_counts ?? null,
      route_domain: sitePostureRoute?.domain ?? null,
      route_command_state: sitePostureRoute?.command_state ?? null,
      route_command_action: sitePostureRoute?.command_action ?? null,
      route_next_action: sitePostureRoute?.next_action ?? null,
      route_target: sitePostureRoute?.target ?? null,
      route_status: sitePostureRoute?.status ?? null,
      route_reason: sitePostureRoute?.reason ?? null,
    };
  }
  if (operation === 'site.read') {
    const status = body?.site_product_status ?? body?.product_status ?? null;
    return {
      operation,
      site_id: body?.site?.site_id ?? body?.site_id ?? status?.site_id ?? null,
      display_name: body?.site?.display_name ?? null,
      active_operation_id: body?.focused_operation_lifecycle?.operation_id ?? body?.operation?.operation_id ?? null,
      health: status?.health ?? null,
      next_action: status?.next_action ?? null,
      continuity_state: status?.continuity_state ?? null,
      continuity_direction_state: status?.continuity_direction_state ?? null,
      continuity_direction_missing: status?.continuity_direction_missing ?? null,
      continuity_loop_state: status?.continuity_loop_state ?? null,
      continuity_reconciliation_execution_state: status?.continuity_reconciliation_execution_state ?? null,
      continuity_reconciliation_execution_health: status?.site_continuity_reconciliation_execution_status?.health ?? status?.continuity_reconciliation_execution_health ?? null,
      continuity_packet_count: status?.continuity_packet_count ?? 0,
      continuity_loop_report_count: status?.continuity_loop_report_count ?? 0,
      continuity_reconciliation_execution_count: status?.continuity_reconciliation_execution_count ?? 0,
      persistence_state: status?.cloudflare_persistence_posture?.state ?? body?.cloudflare_persistence_posture?.state ?? null,
      recovery_state: status?.cloudflare_recovery_posture?.state ?? body?.cloudflare_recovery_posture?.state ?? null,
      membership_count: Array.isArray(body?.memberships) ? body.memberships.length : 0,
      session_count: Array.isArray(body?.sessions) ? body.sessions.length : status?.session_count ?? 0,
      scope_loaded: Boolean(body?.site?.site_id ?? body?.site_id),
    };
  }
  if (operation === 'operation.list') {
    const operations = Array.isArray(body?.operations) ? body.operations : [];
    const overview = body?.operation_posture_overview ?? body?.operation_product_overview ?? {};
    const postureRoute = body?.operation_posture_route ?? null;
    const projectionError = body?.operation_product_projection_error ?? null;
    const nextOperationId = overview.next_operation_id ?? operations[0]?.operation_id ?? null;
    const nextOperation = nextOperationId ? operations.find((item) => item?.operation_id === nextOperationId) ?? null : null;
    const continuationOperations = operations.filter((item) => item?.status === 'needs_continuation');
    const nextContinuationOperation = continuationOperations[0] ?? null;
    return {
      operation,
      continuation_mode: options.continuation === true,
      site_id: body?.site?.site_id ?? body?.site_id ?? operations[0]?.site_id ?? null,
      operation_count: overview.operation_count ?? operations.length,
      active_operation_id: overview.active_operation_id ?? null,
      next_operation_id: nextOperationId,
      next_operation_status: nextOperation?.status ?? null,
      needs_continuation_count: continuationOperations.length,
      next_continuation_operation_id: nextContinuationOperation?.operation_id ?? null,
      next_continuation_operation_status: nextContinuationOperation?.status ?? null,
      continuation_next_action: nextContinuationOperation ? 'read_operation_for_continuation' : 'monitor_operations',
      operation_status_counts: countBy(operations, (item) => item?.status ?? 'unknown'),
      next_status: overview.next_status ?? null,
      next_action: overview.next_action ?? null,
      next_reason: overview.next_reason ?? null,
      health_counts: overview.health_counts ?? null,
      route_domain: postureRoute?.domain ?? null,
      route_command_state: postureRoute?.command_state ?? null,
      route_command_action: postureRoute?.command_action ?? null,
      route_next_action: postureRoute?.next_action ?? null,
      route_target: postureRoute?.target ?? null,
      route_status: postureRoute?.status ?? null,
      route_reason: postureRoute?.reason ?? null,
      projection_error_stage: projectionError?.stage ?? null,
      projection_error_code: projectionError?.code ?? null,
      projection_error_message: projectionError?.message ?? null,
    };
  }
  if (operation === 'operation.read') {
    const lifecycle = body?.operation_lifecycle_status ?? null;
    const statusHistory = body?.operation_status_history ?? body?.operation_product_surface?.status_history ?? null;
    const latestStatusTransition = statusHistory?.latest_transition ?? null;
    const workflowRoute = body?.operation_workflow_route ?? body?.operation_product_surface?.workflow_route ?? null;
    const postureRoute = body?.operation_posture_route ?? body?.operation_product_surface?.posture_route ?? null;
    const postureOverview = body?.operation_posture_overview ?? body?.operation_product_surface?.posture_overview ?? null;
    const recoveryPosture = body?.cloudflare_recovery_posture ?? body?.operation_product_surface?.cloudflare_recovery_posture ?? null;
    const projectionError = body?.operation_product_projection_error ?? null;
    const recoveryBoundaries = Array.isArray(recoveryPosture?.recovery_boundaries) ? recoveryPosture.recovery_boundaries : [];
    const recoveryGaps = Array.isArray(recoveryPosture?.recovery_gaps) ? recoveryPosture.recovery_gaps : [];
    return {
      operation,
      site_id: body?.operation?.site_id ?? body?.site_id ?? null,
      operation_id: body?.operation?.operation_id ?? body?.operation_id ?? null,
      current_status: statusHistory?.current_status ?? body?.operation?.status ?? null,
      status_transition_count: statusHistory?.transition_count ?? 0,
      latest_status_from: latestStatusTransition?.from_status ?? null,
      latest_status_to: latestStatusTransition?.to_status ?? null,
      latest_status_recorded_at: latestStatusTransition?.recorded_at ?? null,
      phase: lifecycle?.phase ?? null,
      health: lifecycle?.health ?? null,
      next_action: lifecycle?.next_action ?? body?.operation_product_surface?.next_action ?? null,
      session_count: lifecycle?.session_count ?? body?.operation_product_surface?.session_count ?? 0,
      active_session_id: Array.isArray(body?.sessions) ? body.sessions[0]?.carrier_session_id ?? body.sessions[0]?.session_id ?? null : null,
      task_count: lifecycle?.task_count ?? body?.operation_product_surface?.task_count ?? 0,
      workflow_next_action: workflowRoute?.next_action ?? null,
      workflow_reason: workflowRoute?.reason ?? null,
      workflow_focus_kind: workflowRoute?.focus_kind ?? null,
      workflow_focus_ref: workflowRoute?.focus_ref ?? workflowRoute?.target ?? null,
      workflow_action_command_kind: workflowRoute?.action_command_kind ?? null,
      workflow_action_command: workflowRoute?.action_command ?? null,
      workflow_continuity_direction_state: workflowRoute?.continuity_direction_state ?? null,
      workflow_continuity_direction_missing: workflowRoute?.continuity_direction_missing ?? null,
      posture_next_status: postureRoute?.next_status ?? postureOverview?.next_status ?? null,
      posture_next_action: postureRoute?.next_action ?? postureOverview?.next_action ?? null,
      posture_target: postureRoute?.target ?? postureOverview?.next_operation_id ?? null,
      posture_reason: postureRoute?.reason ?? postureOverview?.next_reason ?? null,
      recovery_state: recoveryPosture?.state ?? null,
      recovery_boundary_count: recoveryPosture?.recovery_boundary_count ?? null,
      recovery_boundary_keys: recoveryBoundaries.map((boundary) => boundary?.key).filter(Boolean),
      recovery_gap_count: recoveryGaps.length,
      recovery_gap_keys: recoveryGaps.map((gap) => gap?.key ?? gap?.boundary ?? gap).filter(Boolean),
      recovery_next_action: recoveryPosture?.next_action ?? null,
      scope_loaded: Boolean(body?.operation?.operation_id ?? body?.operation_id),
      projection_error_stage: projectionError?.stage ?? null,
      projection_error_code: projectionError?.code ?? null,
      projection_error_message: projectionError?.message ?? null,
    };
  }
  return { operation };
}

export function summarizeProductReadFailure(operation, body = {}, params = {}) {
  return {
    operation,
    ok: body.ok ?? false,
    code: body.code ?? body.error ?? null,
    action: body.action ?? null,
    reason: body.reason ?? null,
    site_id: body.site?.site_id ?? body.site_id ?? params.site_id ?? null,
    operation_id: body.operation?.operation_id ?? body.operation_id ?? params.operation_id ?? null,
    status: body.status ?? null,
  };
}

export function formatProductSurfaceText(result) {
  const summary = result?.summary ?? summarizeProductSurface(result?.operation, result?.response ?? {});
  const operation = summary?.operation ?? result?.operation ?? 'unknown';
  const refused = result?.status === 'refused' || summary?.ok === false;
  const lines = [
    `Product Read: ${operation}${refused ? ' refused' : ''}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
  ];
  if (refused) {
    if (summary.code) lines.push(`Code: ${summary.code}`);
    if (summary.site_id) lines.push(`Site: ${summary.site_id}`);
    if (summary.operation_id) lines.push(`Operation: ${summary.operation_id}`);
    lines.push(`Refusal: action=${summary.action ?? 'deny'} reason=${summary.reason ?? 'unknown'}`);
    if (summary.status) lines.push(`Status: ${summary.status}`);
    return `${lines.join('\n')}\n`;
  }
  if (operation === 'site.list') {
    lines.push(`Sites: count=${summary.site_count ?? 0}`);
    lines.push(`Overview Candidate: site=${summary.next_site_id ?? 'none'} health=${summary.next_health ?? 'unknown'} action=${summary.next_action ?? 'none'}${summary.next_reason ? ` reason=${summary.next_reason}` : ''}`);
    if (summary.route_next_action || summary.route_command_state || summary.route_target) {
      lines.push(`Site Route: domain=${summary.route_domain ?? 'unknown'} state=${summary.route_command_state ?? 'unknown'} action=${summary.route_next_action ?? 'none'} target=${summary.route_target ?? 'none'} status=${summary.route_status ?? 'unknown'} reason=${summary.route_reason ?? 'none'}`);
      lines.push(`Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live -- --url ${result?.worker_url ?? '<worker-url>'} --operator-session-file <operator-session-file> --execute-site-next`);
      if (summary.route_next_action === 'focus_next_site' && summary.next_site_id) {
        lines.push(`Focus Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:focus:workflow:live -- --url ${result?.worker_url ?? '<worker-url>'} --focused-site-id ${summary.next_site_id} --operator-session-file <operator-session-file> --execute-site-focus`);
      }
    }
    if (summary.health_counts) lines.push(`Health Counts: ${formatKeyValueMap(summary.health_counts)}`);
    return `${lines.join('\n')}\n`;
  }
  if (operation === 'site.read') {
    lines.push(`Site: ${summary.site_id ?? 'unknown'}${summary.display_name ? ` (${summary.display_name})` : ''}`);
    lines.push(`Health: ${summary.health ?? 'unknown'}`);
    lines.push(`Next Action: ${summary.next_action ?? 'none'}`);
    lines.push(`Scope Loaded: ${summary.scope_loaded ? 'yes' : 'no'}`);
    lines.push(`Action Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:action:workflow:live -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file> --execute-site-action`);
    if (summary.next_action === 'read_site_scope' || summary.next_action === 'read_membership_site') {
      lines.push(`Site Scope: pnpm --filter @narada2/cloudflare-carrier product:site:scope:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.next_action === 'focus_site_operation') {
      lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file> --execute-operation-next`);
    }
    if (
      summary.next_action === 'read_site_authority'
      || summary.next_action === 'focus_membership_authority'
      || summary.next_action === 'inspect_inactive_membership'
    ) {
      lines.push(`Site Authority: pnpm --filter @narada2/cloudflare-carrier product:site:authority:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.next_action === 'load_or_create_membership' || summary.next_action === 'put_membership') {
      lines.push(`Site Membership Put: pnpm --filter @narada2/cloudflare-carrier product:site:membership:put:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --member-principal-id <principal-id> --role <role> --operator-session-file <operator-session-file>`);
    }
    if (
      (typeof summary.next_action === 'string' && summary.next_action.startsWith('transfer_'))
      || summary.next_action === 'continue_authority_transfer'
      || summary.next_action === 'verify_full_cloudflare_authority'
    ) {
      lines.push(`Authority Transfer: pnpm --filter @narada2/cloudflare-carrier product:authority-transfer:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.active_operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    lines.push(`Continuity: state=${summary.continuity_state ?? 'unknown'} direction=${summary.continuity_direction_state ?? 'unknown'} loop=${summary.continuity_loop_state ?? 'unknown'}`);
    if (summary.continuity_direction_missing?.length > 0) lines.push(`Continuity Missing: ${summary.continuity_direction_missing.join(', ')}`);
    lines.push(`Reconciliation: state=${summary.continuity_reconciliation_execution_state ?? 'unknown'} health=${summary.continuity_reconciliation_execution_health ?? 'unknown'}`);
    lines.push(`Evidence Counts: packets=${summary.continuity_packet_count ?? 0} loops=${summary.continuity_loop_report_count ?? 0} reconciliations=${summary.continuity_reconciliation_execution_count ?? 0}`);
    lines.push(`Durability: persistence=${summary.persistence_state ?? 'unknown'} recovery=${summary.recovery_state ?? 'unknown'}`);
    lines.push(`Authority: memberships=${summary.membership_count ?? 0} sessions=${summary.session_count ?? 0}`);
    return `${lines.join('\n')}\n`;
  }
  if (operation === 'operation.list') {
    lines.push(`Site: ${summary.site_id ?? 'unknown'}`);
    lines.push(`Operations: count=${summary.operation_count ?? 0} active=${summary.active_operation_id ?? 'none'} next=${summary.next_operation_id ?? 'none'}`);
    if (summary.projection_error_stage || summary.projection_error_code) {
      lines.push(`Projection Error: stage=${summary.projection_error_stage ?? 'unknown'} code=${summary.projection_error_code ?? 'unknown'} message=${summary.projection_error_message ?? 'none'}`);
    }
    lines.push(`Lifecycle Statuses: ${formatKeyValueMap(summary.operation_status_counts ?? {})}`);
    if (summary.next_operation_id) lines.push(`Next Operation Status: ${summary.next_operation_status ?? 'unknown'}`);
    if (summary.next_operation_id) {
      lines.push(`Focused Read: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.next_operation_id} --operator-session-file <operator-session-file>`);
      if (
        summary.next_action === 'inspect_operation_evidence'
        || summary.next_action === 'review_carrier_evidence_replay'
        || summary.next_action === 'focus_evidence'
      ) {
        lines.push(`Evidence Read: pnpm --filter @narada2/cloudflare-carrier product:operation:evidence:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.next_operation_id} --operator-session-file <operator-session-file>`);
      }
    }
    if (summary.continuation_mode) {
      lines.push(`Continuation: needed=${summary.needs_continuation_count ?? 0} next=${summary.next_continuation_operation_id ?? 'none'} action=${summary.continuation_next_action ?? 'monitor_operations'}`);
      if (summary.next_continuation_operation_id) {
        lines.push(`Continuation Read: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.next_continuation_operation_id} --operator-session-file <operator-session-file>`);
        lines.push(`Continuation Resume: pnpm --filter @narada2/cloudflare-carrier product:operation:continuation:resume:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.next_continuation_operation_id} --agent-id <agent-id> --operator-session-file <operator-session-file>`);
        lines.push('Continuation Resume Guard: operation.read must route to resume_operation_continuation before mutation; use --skip-route-check only for explicit recovery.');
      }
    }
    lines.push(`Next: status=${summary.next_status ?? 'unknown'} action=${summary.next_action ?? 'none'} reason=${summary.next_reason ?? 'none'}`);
    if (summary.route_next_action || summary.route_command_state || summary.route_target) {
      lines.push(`Operation Route: domain=${summary.route_domain ?? 'unknown'} state=${summary.route_command_state ?? 'unknown'} action=${summary.route_next_action ?? 'none'} target=${summary.route_target ?? 'none'} status=${summary.route_status ?? 'unknown'} reason=${summary.route_reason ?? 'none'}`);
      if (summary.route_next_action === 'focus_next_operation' && summary.next_operation_id) {
        lines.push(`Focus Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:focus:workflow:live -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.next_operation_id} --operator-session-file <operator-session-file> --execute-operation-focus`);
      }
    }
    if (summary.health_counts) lines.push(`Health Counts: ${formatKeyValueMap(summary.health_counts)}`);
    return `${lines.join('\n')}\n`;
  }
  if (operation === 'operation.read') {
    lines.push(`Site: ${summary.site_id ?? 'unknown'}`);
    lines.push(`Operation: ${summary.operation_id ?? 'unknown'}`);
    if (summary.projection_error_stage || summary.projection_error_code) {
      lines.push(`Projection Error: stage=${summary.projection_error_stage ?? 'unknown'} code=${summary.projection_error_code ?? 'unknown'} message=${summary.projection_error_message ?? 'none'}`);
    }
    lines.push(`Status: current=${summary.current_status ?? 'unknown'} transitions=${summary.status_transition_count ?? 0}`);
    if (summary.latest_status_to) {
      lines.push(`Latest Status: ${summary.latest_status_from ?? 'unknown'} -> ${summary.latest_status_to}${summary.latest_status_recorded_at ? ` at ${summary.latest_status_recorded_at}` : ''}`);
    }
    lines.push(`Lifecycle: phase=${summary.phase ?? 'unknown'} health=${summary.health ?? 'unknown'}`);
    lines.push(`Next Action: ${summary.next_action ?? 'none'}`);
    lines.push(`Scope Loaded: ${summary.scope_loaded ? 'yes' : 'no'}`);
    if (summary.workflow_next_action || summary.workflow_reason) {
      lines.push(`Workflow Route: action=${summary.workflow_next_action ?? 'none'} reason=${summary.workflow_reason ?? 'none'}`);
    }
    if (summary.workflow_focus_kind || summary.workflow_focus_ref) {
      lines.push(`Workflow Focus: kind=${summary.workflow_focus_kind ?? 'unknown'} ref=${summary.workflow_focus_ref ?? 'unknown'}`);
    }
    if (summary.workflow_continuity_direction_state || summary.workflow_continuity_direction_missing?.length > 0) {
      lines.push(`Workflow Continuity: direction=${summary.workflow_continuity_direction_state ?? 'unknown'} missing=${formatList(summary.workflow_continuity_direction_missing)}`);
    }
    if (summary.workflow_action_command_kind || summary.workflow_action_command) {
      lines.push(`Workflow Command: kind=${summary.workflow_action_command_kind ?? 'unknown'} command=${summary.workflow_action_command ?? 'none'}`);
    }
    if (summary.posture_next_status || summary.posture_next_action || summary.posture_reason) {
      const postureTargetSuffix = summary.posture_target ? ` target=${summary.posture_target}` : '';
      lines.push(`Posture Route: status=${summary.posture_next_status ?? 'unknown'} action=${summary.posture_next_action ?? 'none'} reason=${summary.posture_reason ?? 'none'}${postureTargetSuffix}`);
    }
    if (summary.recovery_state || summary.recovery_boundary_count !== null || summary.recovery_gap_count !== null) {
      lines.push(`Recovery: state=${summary.recovery_state ?? 'unknown'} boundaries=${summary.recovery_boundary_count ?? 'unknown'} gaps=${summary.recovery_gap_count ?? 'unknown'}`);
      if (summary.recovery_next_action || summary.recovery_gap_keys?.length > 0) {
        lines.push(`Recovery Next: action=${summary.recovery_next_action ?? 'none'} gaps=${formatList(summary.recovery_gap_keys)}`);
      }
      if (summary.recovery_boundary_keys?.length > 0) {
        lines.push(`Recovery Boundaries: ${formatList(summary.recovery_boundary_keys)}`);
      }
    }
    lines.push(`Evidence Counts: sessions=${summary.session_count ?? 0} tasks=${summary.task_count ?? 0}`);
    if (summary.workflow_next_action === 'review_mailbox_draft_reply_proposal') {
      lines.push(`Mailbox Proposal Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:draft-reply-proposal:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_mailbox_send_confirmation') {
      lines.push(`Mailbox Send Confirmation: pnpm --filter @narada2/cloudflare-carrier product:mailbox:send-confirmation:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_mailbox_send_acceptance') {
      lines.push(`Mailbox Send Accepted: pnpm --filter @narada2/cloudflare-carrier product:mailbox:send-accepted:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_mailbox_outlook_draft_create' || summary.workflow_next_action === 'review_outlook_draft_create_evidence') {
      lines.push(`Mailbox Outlook Draft Review: pnpm --filter @narada2/cloudflare-carrier product:mailbox:outlook-draft:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_directive_delivery') {
      lines.push(`Directive Delivery Review: pnpm --filter @narada2/cloudflare-carrier product:directive:delivery:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'focus_webhook_delay_directive_intent') {
      lines.push(`Directive Delivery Review: pnpm --filter @narada2/cloudflare-carrier product:directive:delivery:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'focus_webhook_delay_directive_delivery') {
      lines.push(`Directive Delivery Review: pnpm --filter @narada2/cloudflare-carrier product:directive:delivery:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'focus_webhook_delay_shadow_read') {
      lines.push(`Webhook Delay Shadow Read: pnpm --filter @narada2/cloudflare-carrier product:webhook-delay:shadow-read:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'create_task_from_directive_intent') {
      lines.push(`Task Create From Directive Intent: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:create-from-directive-intent:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'focus_lifecycle_directive_delivery') {
      lines.push(`Directive Delivery Review: pnpm --filter @narada2/cloudflare-carrier product:directive:delivery:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_repository_publication_request') {
      lines.push(`Repository Publication Review: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:request:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_repository_publication_execution' || summary.workflow_next_action === 'review_cloudflare_github_repository_publication_execution') {
      lines.push(`Repository Publication Execution Read: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_repository_publication_evidence') {
      lines.push(`Repository Publication Evidence Read: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:evidence:list:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_local_ingress_provider_liveness') {
      lines.push(`Local Ingress Provider Liveness: pnpm --filter @narada2/cloudflare-carrier product:local-ingress:provider-liveness:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'restore_windows_local_ingress_executor') {
      lines.push(`Local Ingress Provider Liveness: pnpm --filter @narada2/cloudflare-carrier product:local-ingress:provider-liveness:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_local_ingress_request') {
      lines.push(`Local Ingress Request Review: pnpm --filter @narada2/cloudflare-carrier product:local-ingress:request:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_local_ingress_evidence') {
      lines.push(`Local Ingress Evidence Review: pnpm --filter @narada2/cloudflare-carrier product:local-ingress:evidence:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_repository_publication_provider_liveness') {
      lines.push(`Repository Publication Provider Liveness: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:provider-liveness:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'restore_windows_repository_publication_provider') {
      lines.push(`Repository Publication Provider Liveness: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:provider-liveness:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (
      summary.workflow_next_action === 'focus_authority_evidence'
      || summary.workflow_next_action === 'review_refused_authority'
      || summary.workflow_next_action === 'review_unresolved_locus'
      || summary.workflow_next_action === 'monitor_authority_admissions'
    ) {
      lines.push(`Site Authority: pnpm --filter @narada2/cloudflare-carrier product:site:authority:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_site_file_change_proposal') {
      lines.push(`Site File Change Proposal Review: pnpm --filter @narada2/cloudflare-carrier product:site-file-change:proposal:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_site_file_materialization') {
      lines.push(`Site File Materialization Review: pnpm --filter @narada2/cloudflare-carrier product:site-file:materialization:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (
      summary.workflow_next_action === 'focus_open_task'
      || summary.workflow_next_action === 'focus_lifecycle_open_task'
      || summary.workflow_next_action === 'focus_task_path_evidence'
    ) {
      lines.push(`Task Lifecycle Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --task-id ${summary.route_target ?? '<task-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'focus_operation_path_task') {
      lines.push(`Task Lifecycle Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'focus_session_path_task') {
      lines.push(`Task Lifecycle Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --carrier-session-id ${summary.active_session_id ?? '<session-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'focus_lifecycle_start_session') {
      lines.push(`Session Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:session:workflow:live -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file> --execute-operation-session`);
    }
    if (summary.workflow_next_action === 'focus_lifecycle_continuity' || summary.workflow_next_action === 'focus_lifecycle_continuity_loop_report') {
      lines.push(`Continuity Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:continuity:workflow:live -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --expected-pre-action ${summary.workflow_next_action ?? 'refresh_site_continuity_loop'} --operator-session-file <operator-session-file> --execute-operation-continuity`);
    }
    if (
      summary.workflow_next_action === 'read_session_evidence'
      || summary.workflow_next_action === 'inspect_session_evidence'
      || summary.workflow_next_action === 'focus_session_path_evidence'
    ) {
      lines.push(`Session Evidence: pnpm --filter @narada2/cloudflare-carrier product:session:evidence:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --carrier-session-id ${summary.active_session_id ?? '<session-id>'} --operator-session-file <operator-session-file>`);
    }
    if (
      summary.workflow_next_action === 'review_operation_operator_focus'
      || summary.workflow_next_action === 'review_carrier_evidence_replay'
      || summary.workflow_next_action === 'focus_lifecycle_read_evidence'
      || summary.workflow_next_action === 'focus_operation_path_attention'
      || summary.workflow_next_action === 'focus_evidence'
      || summary.workflow_next_action === 'focus_open_attention'
      || summary.workflow_next_action === 'monitor_operation_evidence'
    ) {
      lines.push(`Evidence Read: pnpm --filter @narada2/cloudflare-carrier product:operation:evidence:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'focus_authority_path_evidence') {
      lines.push(`Site Authority: pnpm --filter @narada2/cloudflare-carrier product:site:authority:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'start_resident_dispatch') {
      lines.push(`Resident Dispatch Workflow: pnpm --filter @narada2/cloudflare-carrier product:resident-dispatch:workflow:live -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'request_windows_fallback_resident_dispatch') {
      lines.push(`Resident Dispatch Windows Fallback Request: pnpm --filter @narada2/cloudflare-carrier product:resident-dispatch:windows-fallback-request:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --dispatch-decision-id ${summary.workflow_focus_ref ?? '<dispatch-decision-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'await_windows_fallback_resident_dispatch') {
      lines.push(`Resident Dispatch Windows Fallback Execute: pnpm --filter @narada2/cloudflare-carrier product:resident-dispatch:windows-fallback:execute:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file> --execute-windows-fallback`);
      lines.push(`Resident Dispatch Windows Fallback Read: pnpm --filter @narada2/cloudflare-carrier product:resident-dispatch:windows-fallback-request:text -- --operation resident_dispatch.windows_fallback_request.list --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_windows_fallback_resident_dispatch_evidence') {
      lines.push(`Resident Dispatch Windows Fallback Evidence Review: pnpm --filter @narada2/cloudflare-carrier product:resident-dispatch:windows-fallback-evidence:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
      lines.push(`Resident Dispatch Windows Fallback Evidence: pnpm --filter @narada2/cloudflare-carrier product:resident-dispatch:windows-fallback-evidence:text -- --operation resident_dispatch.windows_fallback_evidence.list --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_persistence_posture') {
      lines.push(`Persistence Review: pnpm --filter @narada2/cloudflare-carrier product:operation:persistence:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_recovery_posture') {
      lines.push(`Recovery Review: pnpm --filter @narada2/cloudflare-carrier product:operation:recovery:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'read_operation_scope') {
      lines.push(`Operation Scope: pnpm --filter @narada2/cloudflare-carrier product:operation:scope:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (summary.workflow_next_action === 'review_continuity_packet' || summary.workflow_next_action === 'observe_continuity_packet' || summary.workflow_next_action === 'review_continuity_loop_report' || summary.workflow_next_action === 'refresh_site_continuity_loop') {
      lines.push(`Continuity Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:continuity:workflow:live -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --expected-pre-action ${summary.workflow_next_action ?? 'refresh_site_continuity_loop'} --operator-session-file <operator-session-file> --execute-operation-continuity`);
    }
    if (summary.workflow_next_action === 'bridge_local_resident_carrier_evidence') {
      lines.push(`Local Resident Carrier Bridge: pnpm --filter @narada2/cloudflare-carrier product:resident-dispatch:local-resident-carrier-bridge:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    if (
      summary.posture_next_action === 'focus_next_operation'
      || summary.next_action === 'inspect_operation_evidence'
      || summary.workflow_next_action === 'review_carrier_evidence_replay'
    ) {
      lines.push(`Evidence Read: pnpm --filter @narada2/cloudflare-carrier product:operation:evidence:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id ?? '<operation-id>'} --operator-session-file <operator-session-file>`);
    }
    return `${lines.join('\n')}\n`;
  }
  return `${lines.join('\n')}\n`;
}

export function resolveAuth(args = [], env = process.env) {
  const token = option(args, '--token') ?? null;
  if (token) return { kind: 'bearer', value: token, source: 'flag:--token' };
  const tokenFile = option(args, '--token-file') ?? null;
  if (tokenFile) return { kind: 'bearer', value: readFileSync(tokenFile, 'utf8').trim(), source: 'token-file' };

  const cookie = option(args, '--operator-session-cookie') ?? null;
  if (cookie) return { kind: 'operator_session', value: normalizeOperatorSessionCookie(cookie), source: 'operator-session-cookie' };
  const sessionFile = option(args, '--operator-session-file') ?? null;
  if (sessionFile) {
    const session = parseJsonText(readFileSync(sessionFile, 'utf8'));
    if (!session?.cookie) throw new Error('product_read_operator_session_file_missing_cookie');
    return { kind: 'operator_session', value: normalizeOperatorSessionCookie(session.cookie), source: 'operator-session-file' };
  }
  const envTokenFile = env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  if (envTokenFile) return { kind: 'bearer', value: readFileSync(envTokenFile, 'utf8').trim(), source: 'env:CLOUDFLARE_CARRIER_TOKEN_FILE' };
  if (env.CLOUDFLARE_CARRIER_TOKEN) return { kind: 'bearer', value: env.CLOUDFLARE_CARRIER_TOKEN, source: 'env:CLOUDFLARE_CARRIER_TOKEN' };
  if (env.CLOUDFLARE_OPERATOR_SESSION_COOKIE) {
    return { kind: 'operator_session', value: normalizeOperatorSessionCookie(env.CLOUDFLARE_OPERATOR_SESSION_COOKIE), source: 'env:CLOUDFLARE_OPERATOR_SESSION_COOKIE' };
  }
  const envSessionFile = env.CLOUDFLARE_OPERATOR_SESSION_FILE ?? null;
  if (envSessionFile) {
    const session = parseJsonText(readFileSync(envSessionFile, 'utf8'));
    if (!session?.cookie) throw new Error('product_read_operator_session_file_missing_cookie');
    return { kind: 'operator_session', value: normalizeOperatorSessionCookie(session.cookie), source: 'env:CLOUDFLARE_OPERATOR_SESSION_FILE' };
  }
  return null;
}

export function authHeaders(auth) {
  if (auth.kind === 'bearer') return { authorization: `Bearer ${auth.value}` };
  if (auth.kind === 'operator_session') return { cookie: `narada_operator_session=${auth.value}` };
  throw new Error(`product_read_auth_kind_unsupported:${auth.kind}`);
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function flag(args, name) {
  return args.includes(name);
}

function positionalArgs(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const entry = args[index];
    if (entry.startsWith('--')) {
      index += 1;
      continue;
    }
    values.push(entry);
  }
  return values;
}

function parseOptionalInteger(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`product_read_${label}_invalid`);
  return parsed;
}

function countBy(items, classifier) {
  const counts = {};
  for (const item of Array.isArray(items) ? items : []) {
    const key = classifier(item) || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function normalizeWorkerUrl(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

function normalizeOperatorSessionCookie(value) {
  const text = String(value ?? '').trim();
  const match = /(?:^|;\s*)narada_operator_session=([^;]+)/.exec(text);
  return match ? match[1] : text;
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function formatKeyValueMap(value) {
  return Object.entries(value ?? {})
    .map(([key, count]) => `${key}=${count}`)
    .join(' ');
}

function formatList(value) {
  return Array.isArray(value) && value.length > 0 ? value.join(', ') : 'none';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseProductReadArgs(process.argv.slice(2));
    const result = await readProductSurface(config);
    if (config.format === 'text') {
      process.stdout.write(formatProductSurfaceText(result));
    } else {
      process.stdout.write(JSON.stringify(config.format === 'summary' ? result.summary : result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(formatProductSurfaceText({
        status: 'refused',
        operation: error.config.operation,
        worker_url: error.config.workerUrl,
        auth_source: error.config.auth?.source,
        params: error.config.params,
        response: error.response,
        summary: error.summary,
      }));
    } else {
      process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response }, null, 2) + '\n');
    }
    process.exit(1);
  }
}

