export type LaunchProcessOwnershipKind = 'session_owned' | 'host_owned' | 'shared_service' | 'unknown';
export type LaunchProcessRole = 'workspace_launch_plan' | 'runtime_start' | 'runtime_server' | 'mcp_child' | 'operator_projection' | 'helper' | 'unknown';

export interface LaunchProcessOwnership {
  schema: 'narada.launch_process_ownership.v1';
  launch_session_id: string;
  ownership: LaunchProcessOwnershipKind;
  process_role: LaunchProcessRole;
  owner_site_root: string | null;
  workspace_root: string | null;
  created_by_pid: number | null;
  launch_supervisor_pid: number | null;
  cleanup_policy: 'terminate_with_launch_session' | null;
  transfer_policy: 'explicit_only' | null;
  evidence_status: 'complete' | 'partial';
  validation_errors: string[];
}

export function launchSessionIdFromToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const normalized = token.replace(/\.json$/i, '').replace(/[^0-9A-Za-z_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized ? `launch_${normalized}` : null;
}

export function buildLaunchProcessOwnership(args: {
  launchSessionId: string;
  ownership?: LaunchProcessOwnershipKind | null;
  processRole: LaunchProcessRole;
  siteRoot?: string | null;
  workspaceRoot?: string | null;
  createdByPid?: number | null;
  launchSupervisorPid?: number | null;
}): LaunchProcessOwnership {
  const ownership = normalizeOwnership(args.ownership ?? 'session_owned');
  const processRole = normalizeProcessRole(args.processRole);
  const validationErrors = [
    ...(ownership === 'unknown' ? ['ownership_unknown_or_invalid'] : []),
    ...(processRole === 'unknown' ? ['process_role_unknown_or_invalid'] : []),
    ...(args.launchSessionId ? [] : ['launch_session_id_missing']),
  ];
  return {
    schema: 'narada.launch_process_ownership.v1',
    launch_session_id: args.launchSessionId,
    ownership,
    process_role: processRole,
    owner_site_root: args.siteRoot ?? null,
    workspace_root: args.workspaceRoot ?? null,
    created_by_pid: Number.isInteger(args.createdByPid) ? args.createdByPid! : null,
    launch_supervisor_pid: Number.isInteger(args.launchSupervisorPid) ? args.launchSupervisorPid! : null,
    cleanup_policy: ownership === 'session_owned' ? 'terminate_with_launch_session' : null,
    transfer_policy: ownership === 'session_owned' ? 'explicit_only' : null,
    evidence_status: validationErrors.length === 0 ? 'complete' : 'partial',
    validation_errors: validationErrors,
  };
}

function normalizeOwnership(value: unknown): LaunchProcessOwnershipKind {
  return value === 'session_owned' || value === 'host_owned' || value === 'shared_service'
    ? value
    : 'unknown';
}

function normalizeProcessRole(value: unknown): LaunchProcessRole {
  return value === 'workspace_launch_plan'
    || value === 'runtime_start'
    || value === 'runtime_server'
    || value === 'mcp_child'
    || value === 'operator_projection'
    || value === 'helper'
    ? value
    : 'unknown';
}
