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

export function launchSessionIdFromToken(token: string | undefined | null): string | null;
export function buildLaunchProcessOwnership(args: BuildLaunchProcessOwnershipArgs): LaunchProcessOwnership;
export const buildLaunchProcessOwnershipEvidence: typeof buildLaunchProcessOwnership;
export function normalizeOwnership(value: unknown): LaunchProcessOwnershipKind;
export function normalizeProcessRole(value: unknown): LaunchProcessRole;
export function normalizeOptionalString(value: unknown): string | null;
export function normalizeOptionalInteger(value: unknown): number | null;
