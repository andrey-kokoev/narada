import type { LaunchProcessOwnership } from '@narada2/launch-process-ownership';
import type { AgentStartSessionRef } from '@narada2/agent-start/launch-result-v0-contract';

export type JsonRecord = Record<string, unknown>;

export interface LaunchResultSummary {
  path: string;
  mtime_ms: number;
  schema?: string;
  status?: string;
  agent_start_event?: string;
  identity?: string;
  agent_identity_ref?: unknown;
  operator_surface_kind?: string;
  runtime_host_kind?: string;
  carrier_kind?: string;
  runtime?: string;
  runtime_substrate_kind?: string;
  site_root?: string;
  target_site_root?: string;
  session_site_root?: string;
  runtime_session_id?: string;
  nars_session_id?: string;
  carrier_session_id?: string;
  session_ref?: AgentStartSessionRef | null;
  control_path?: string;
  control_path_exists?: boolean;
  session_path?: string;
  session_path_exists?: boolean;
  launch_source?: string;
  parent_pid?: number;
  parent_process_alive?: boolean | null;
  started_at?: string;
  expires_at?: string;
}

export interface OperatorSurfaceRuntimeStatusOptions {
  siteRoot: string;
  agent?: string;
  carrier?: string;
  runtime?: string;
  now?: Date;
}

export interface AgentStartOptions {
  siteRoot: string;
  targetSiteId?: string;
  workspaceRoot?: string;
  agent: string;
  carrier?: string;
  runtime: string;
  authority?: string;
  intelligenceProvider?: string;
  mcpScope?: string;
  dryRun?: boolean;
  exec?: boolean;
  wait?: boolean;
  enableNativeShell?: boolean;
  launchSource?: string;
  launchBindingPath?: string;
  launchSessionId?: string;
}

export interface OperatorProjectionLaunchBinding {
  schema: 'narada.operator_projection_launch_binding.v1';
  status: 'waiting_for_agent_start' | 'ready' | 'failed';
  created_at: string;
  updated_at: string;
  site_root: string;
  workspace_root: string;
  agent: string;
  operator_surface_kind?: string;
  runtime_host_kind: string;
  authority?: string | null;
  intelligence_provider?: string | null;
  agent_start_result_file?: string;
  nars_session_id?: string | null;
  runtime_session_id?: string | null;
  carrier_session_id?: string | null;
  session_ref?: AgentStartSessionRef | null;
  launch_session_id?: string | null;
  process_ownership?: LaunchProcessOwnership | null;
  reason?: string | null;
}

export interface CommandExecutionResult {
  status: 'success' | 'failed';
  exit_code: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface AgentStartExecutionResult extends Omit<CommandExecutionResult, 'status'> {
  status: 'success' | 'starting' | 'failed';
}

export interface AgentStartCommandResult {
  schema: 'narada.agent_start.command_result.v0';
  status: 'success' | 'starting' | 'failed' | 'not_available';
  mutation_performed: boolean;
  site_root: string;
  agent: string;
  carrier?: string;
  runtime: string;
  command: string[];
  execution?: AgentStartExecutionResult;
  result_handoff?: 'json_output_file';
  result_file?: string;
  parsed_result?: unknown;
  error?: string;
}

export interface OperatorSurfaceRuntimeStatusResult {
  schema: 'narada.carrier.status.v0';
  status: 'ok' | 'not_found';
  mutation_performed: false;
  site_root: string;
  agent?: string;
  carrier?: string;
  runtime?: string;
  latest?: LaunchResultSummary;
  launch_results_dir: string;
  launch_results_seen: number;
  candidates_scanned: number;
}

export interface SiteCommandResult {
  schema: 'narada.site_command_result.v0';
  status: 'success' | 'failed' | 'not_available';
  mutation_performed: boolean;
  site_root: string;
  command: string[];
  execution?: CommandExecutionResult;
  parsed_stdout?: unknown;
  error?: string;
}

export interface NarsSessionContract extends JsonRecord {
  session_id?: unknown;
  carrier_session_id?: unknown;
  runtime_session_id?: unknown;
  agent_id?: unknown;
  agent_identity_ref?: unknown;
  site_id?: unknown;
  site_root?: unknown;
  display_state?: unknown;
  terminal_state?: unknown;
  health_status?: unknown;
  started_at?: unknown;
  last_seen_at?: unknown;
  projection_generated_at?: unknown;
  event_endpoint?: unknown;
  health_endpoint?: unknown;
  authority_runtime_host?: unknown;
  authority_epoch?: unknown;
  authority_runtime_id?: unknown;
  authority_transition_state?: unknown;
  source_write_admission?: unknown;
  superseded_by_session_id?: unknown;
  authority_locator_ref?: unknown;
  record?: JsonRecord;
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function asJsonRecord(value: unknown): JsonRecord | null {
  return isJsonRecord(value) ? value : null;
}

export function stringField(record: JsonRecord | null | undefined, field: string): string | null {
  const value = record?.[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function integerField(record: JsonRecord | null | undefined, field: string): number | null {
  const value = record?.[field];
  return Number.isInteger(value) ? value as number : null;
}

export function objectField(record: JsonRecord | null | undefined, field: string): JsonRecord | null {
  return asJsonRecord(record?.[field]);
}

export function sessionIdFromContract(record: JsonRecord | null): string | null {
  if (!record) return null;
  const sessionRef = objectField(record, 'session_ref');
  const narsLaunch = objectField(record, 'nars_launch');
  const requiredEnvironment = objectField(record, 'required_environment');
  const sessionRefKind = stringField(sessionRef, 'kind');
  const canonicalSessionId = sessionRefKind === 'runtime'
    || sessionRefKind === 'nars'
    || sessionRefKind === 'carrier'
    ? stringField(sessionRef, 'id')
    : null;
  return canonicalSessionId
    ?? stringField(record, 'nars_session_id')
    ?? stringField(record, 'runtime_session_id')
    ?? stringField(record, 'session_id')
    ?? stringField(narsLaunch, 'nars_session_id')
    ?? stringField(narsLaunch, 'runtime_session_id')
    ?? stringField(narsLaunch, 'session_id')
    ?? stringField(requiredEnvironment, 'NARADA_NARS_SESSION_ID')
    ?? stringField(requiredEnvironment, 'NARADA_RUNTIME_SESSION_ID')
    ?? stringField(requiredEnvironment, 'NARADA_CARRIER_SESSION_ID');
}
