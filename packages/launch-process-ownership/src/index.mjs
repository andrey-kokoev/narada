const OWNERSHIP_VALUES = new Set(['session_owned', 'host_owned', 'shared_service']);
const PROCESS_ROLE_VALUES = new Set([
  'workspace_launch_plan',
  'runtime_start',
  'runtime_server',
  'mcp_child',
  'operator_projection',
  'helper',
]);

export function launchSessionIdFromToken(token) {
  if (!token) return null;
  const normalized = String(token).replace(/\.json$/i, '').replace(/[^0-9A-Za-z_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized ? `launch_${normalized}` : null;
}

export function buildLaunchProcessOwnership(args = {}) {
  const launchSessionId = normalizeOptionalString(args.launchSessionId ?? args.launch_session_id);
  const ownership = normalizeOwnership(args.ownership ?? 'session_owned');
  const processRole = normalizeProcessRole(args.processRole ?? args.process_role);
  const validationErrors = [
    ...(ownership === 'unknown' ? ['ownership_unknown_or_invalid'] : []),
    ...(processRole === 'unknown' ? ['process_role_unknown_or_invalid'] : []),
    ...(launchSessionId ? [] : ['launch_session_id_missing']),
  ];
  return {
    schema: 'narada.launch_process_ownership.v1',
    launch_session_id: launchSessionId ?? '',
    ownership,
    process_role: processRole,
    owner_site_root: normalizeOptionalString(args.siteRoot ?? args.ownerSiteRoot ?? args.owner_site_root),
    workspace_root: normalizeOptionalString(args.workspaceRoot ?? args.workspace_root),
    created_by_pid: normalizeOptionalInteger(args.createdByPid ?? args.created_by_pid),
    launch_supervisor_pid: normalizeOptionalInteger(args.launchSupervisorPid ?? args.launch_supervisor_pid),
    cleanup_policy: ownership === 'session_owned' ? 'terminate_with_launch_session' : null,
    transfer_policy: ownership === 'session_owned' ? 'explicit_only' : null,
    ...(normalizeOptionalInteger(args.pid) !== null ? { pid: normalizeOptionalInteger(args.pid) } : {}),
    ...(normalizeOptionalString(args.parentProcessRole ?? args.parent_process_role) ? { parent_process_role: normalizeOptionalString(args.parentProcessRole ?? args.parent_process_role) } : {}),
    ...(normalizeOptionalString(args.serverName ?? args.server_name) ? { server_name: normalizeOptionalString(args.serverName ?? args.server_name) } : {}),
    evidence_status: validationErrors.length === 0 ? 'complete' : 'partial',
    validation_errors: validationErrors,
  };
}

export const buildLaunchProcessOwnershipEvidence = buildLaunchProcessOwnership;

export function normalizeOwnership(value) {
  return OWNERSHIP_VALUES.has(value) ? value : 'unknown';
}

export function normalizeProcessRole(value) {
  return PROCESS_ROLE_VALUES.has(value) ? value : 'unknown';
}

export function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeOptionalInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}
