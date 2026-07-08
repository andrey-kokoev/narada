export function buildLaunchProcessOwnershipEvidence({
  launchSessionId = null,
  ownership = null,
  processRole = null,
  ownerSiteRoot = null,
  workspaceRoot = null,
  createdByPid = null,
  launchSupervisorPid = null,
  pid = null,
  parentProcessRole = null,
  serverName = null,
} = {}) {
  const normalizedLaunchSessionId = normalizeOptionalString(launchSessionId);
  const normalizedOwnership = normalizeProcessOwnership(ownership);
  const normalizedProcessRole = normalizeProcessRole(processRole);
  const normalizedCreatedByPid = normalizeOptionalInteger(createdByPid);
  const normalizedPid = normalizeOptionalInteger(pid);
  const normalizedSupervisorPid = normalizeOptionalInteger(launchSupervisorPid);
  if (!normalizedLaunchSessionId && !normalizedOwnership && !normalizedProcessRole && normalizedCreatedByPid == null) return null;
  const validationErrors = [
    ...(normalizedLaunchSessionId ? [] : ['launch_session_id_missing']),
    ...(normalizedOwnership ? [] : ['ownership_missing_or_invalid']),
    ...(normalizedProcessRole ? [] : ['process_role_missing_or_invalid']),
  ];
  return {
    schema: 'narada.launch_process_ownership.v1',
    launch_session_id: normalizedLaunchSessionId,
    ownership: normalizedOwnership ?? 'unknown',
    process_role: normalizedProcessRole ?? 'unknown',
    owner_site_root: ownerSiteRoot ?? null,
    workspace_root: workspaceRoot ?? null,
    created_by_pid: normalizedCreatedByPid,
    launch_supervisor_pid: normalizedSupervisorPid,
    ...(parentProcessRole ? { parent_process_role: parentProcessRole } : {}),
    ...(serverName ? { server_name: serverName } : {}),
    ...(normalizedPid == null ? {} : { pid: normalizedPid }),
    cleanup_policy: normalizedOwnership === 'session_owned' ? 'terminate_with_launch_session' : null,
    transfer_policy: normalizedOwnership === 'session_owned' ? 'explicit_only' : null,
    evidence_status: validationErrors.length === 0 ? 'complete' : 'partial',
    validation_errors: validationErrors,
  };
}

export function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeOptionalInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function normalizeProcessOwnership(value) {
  return value === 'session_owned' || value === 'host_owned' || value === 'shared_service' ? value : null;
}

function normalizeProcessRole(value) {
  return value === 'workspace_launch_plan'
    || value === 'runtime_start'
    || value === 'runtime_server'
    || value === 'mcp_child'
    || value === 'operator_projection'
    || value === 'helper'
    ? value
    : null;
}
