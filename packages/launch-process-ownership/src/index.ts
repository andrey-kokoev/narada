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
  pid?: number;
  parent_process_role?: string;
  server_name?: string;
  evidence_status: 'complete' | 'partial';
  validation_errors: string[];
}

export interface BuildLaunchProcessOwnershipArgs {
  launchSessionId?: string | null;
  launch_session_id?: string | null;
  ownership?: LaunchProcessOwnershipKind | string | null;
  processRole?: LaunchProcessRole | string | null;
  process_role?: LaunchProcessRole | string | null;
  siteRoot?: string | null;
  ownerSiteRoot?: string | null;
  owner_site_root?: string | null;
  workspaceRoot?: string | null;
  workspace_root?: string | null;
  createdByPid?: number | string | null;
  created_by_pid?: number | string | null;
  launchSupervisorPid?: number | string | null;
  launch_supervisor_pid?: number | string | null;
  pid?: number | string | null;
  parentProcessRole?: string | null;
  parent_process_role?: string | null;
  serverName?: string | null;
  server_name?: string | null;
}

const OWNERSHIP_VALUES = new Set<LaunchProcessOwnershipKind>([
  'session_owned',
  'host_owned',
  'shared_service',
]);
const PROCESS_ROLE_VALUES = new Set<LaunchProcessRole>([
  'workspace_launch_plan',
  'runtime_start',
  'runtime_server',
  'mcp_child',
  'operator_projection',
  'helper',
]);
const SESSION_OWNED_PID_REQUIRED_ROLES = new Set<LaunchProcessRole>([
  'runtime_server',
  'mcp_child',
  'helper',
]);

export function launchSessionIdFromToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const normalized = String(token)
    .replace(/\.json$/i, '')
    .replace(/[^0-9A-Za-z_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized ? `launch_${normalized}` : null;
}

export function buildLaunchProcessOwnership(
  args: BuildLaunchProcessOwnershipArgs = {},
): LaunchProcessOwnership {
  const launchSessionId = normalizeOptionalString(args.launchSessionId ?? args.launch_session_id);
  const ownership = normalizeOwnership(args.ownership ?? 'session_owned');
  const processRole = normalizeProcessRole(args.processRole ?? args.process_role);
  const pid = normalizeOptionalInteger(args.pid);
  const validationErrors: string[] = [
    ...(ownership === 'unknown' ? ['ownership_unknown_or_invalid'] : []),
    ...(processRole === 'unknown' ? ['process_role_unknown_or_invalid'] : []),
    ...(launchSessionId ? [] : ['launch_session_id_missing']),
    ...(
      ownership === 'session_owned'
      && SESSION_OWNED_PID_REQUIRED_ROLES.has(processRole)
      && pid === null
        ? ['session_owned_pid_missing']
        : []
    ),
  ];
  const parentProcessRole = normalizeOptionalString(args.parentProcessRole ?? args.parent_process_role);
  const serverName = normalizeOptionalString(args.serverName ?? args.server_name);
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
    ...(pid !== null ? { pid } : {}),
    ...(parentProcessRole ? { parent_process_role: parentProcessRole } : {}),
    ...(serverName ? { server_name: serverName } : {}),
    evidence_status: validationErrors.length === 0 ? 'complete' : 'partial',
    validation_errors: validationErrors,
  };
}

export const buildLaunchProcessOwnershipEvidence = buildLaunchProcessOwnership;

export function normalizeOwnership(value: unknown): LaunchProcessOwnershipKind {
  return typeof value === 'string' && OWNERSHIP_VALUES.has(value as LaunchProcessOwnershipKind)
    ? value as LaunchProcessOwnershipKind
    : 'unknown';
}

export function normalizeProcessRole(value: unknown): LaunchProcessRole {
  return typeof value === 'string' && PROCESS_ROLE_VALUES.has(value as LaunchProcessRole)
    ? value as LaunchProcessRole
    : 'unknown';
}

export function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeOptionalInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}
