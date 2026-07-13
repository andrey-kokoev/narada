import type { AgentIdentityRefV2 } from '@narada2/agent-identity';
import type { WorkspaceLaunchSelection } from '@narada2/workspace-launch-contract';
import type { CliFormat } from '../lib/cli-output.js';
import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import type { WorkspaceLaunchUiSessionRecord } from './workspace-launch-session-store.js';

export interface WorkspaceLaunchProjectionObservationRecord {
  schema: 'narada.workspace_launch.observed_projection.v1';
  observation_id: string;
  launch_attempt_id: string;
  projection_kind: 'agent-web-ui' | 'agent-cli';
  session_id: string | null;
  status: 'planned' | 'handed_off' | 'failed';
  command: string;
  authority: 'nars_client_projection_contract';
  ownership_posture: 'handoff_only' | 'owned_by_projection_authority';
  observed_at: string;
  message: string;
  diagnostic: unknown;
}

export interface WorkspaceLaunchPlanOptions {
  agent?: string[];
  all?: boolean;
  role?: string[];
  site?: string[];
  configPath?: string[];
  registryPath?: string;
  operatorSurface?: string;
  onboarding?: boolean;
  runtime?: string;
  authority?: string;
  intelligenceProvider?: string;
  mcpScope?: string;
  cloudflareApiBaseUrl?: string;
  interactiveSelection?: boolean;
  interactiveSelectionUi?: boolean;
  launcherUiPort?: number;
  launcherUiPortFallback?: boolean;
  operatorRouterPort?: number;
  launcherOutput?: string[];
  defaultInteractiveSelection?: boolean;
  resultPath?: string;
  suppressResultOutput?: boolean;
  enableNativeShell?: boolean;
  noWaitForEnterBeforeExec?: boolean;
  smoke?: boolean;
  dryRun?: boolean;
  format?: CliFormat;
}

export type WorkspaceLaunchAttemptStatus = 'queued' | 'planning' | 'launching' | 'launched' | 'failed' | 'forgotten';
export type WorkspaceLauncherOutputProjection = 'summary' | 'events' | 'commands' | 'json' | 'quiet';

export interface WorkspaceLaunchLegacyCarrierCompatibility {
  schema: 'narada.workspace_launch.legacy_carrier_compatibility.v1';
  status: 'compatibility_fields_present';
  canonical_terms: {
    operator_surface: 'operator_surface';
    runtime_host: 'runtime_host';
  };
  compatibility_paths: {
    command_aliases: string[];
    runtime_aliases: string[];
    status: 'fenced_compatibility';
  };
  compatibility_note: string;
  deprecated_fields: string[];
  replacement_fields: Record<string, string>;
  removal_policy: 'remove_after_consumers_migrate';
}

export interface WorkspaceLaunchHandoffRecord {
  schema: 'narada.workspace_launch.handoff.v1';
  handoff_id: string;
  launch_attempt_id: string;
  posture: 'operator_terminal' | 'hidden_runtime_host';
  status: 'planned' | 'handed_off' | 'failed' | 'unknown_after_handoff';
  command: string | null;
  argv_redacted: string[];
  cwd: string | null;
  exit_code: number | null;
  ownership_posture: 'handoff_only';
  diagnostic_ref: string | null;
}

export interface WorkspaceLaunchObservationRecord {
  schema: 'narada.workspace_launch.observed_runtime.v1';
  observation_id: string;
  launch_attempt_id: string;
  kind: 'nars';
  session_id: string | null;
  site_root: string | null;
  health: 'waiting' | 'healthy' | 'ambiguous' | 'stale' | 'failed' | 'unowned';
  authority: 'nars_session_management';
  ownership_posture: 'not_yet_observed' | 'owned_by_runtime_authority' | 'observed_unowned';
  last_checked_at: string;
  message: string;
  agent_id?: string | null;
  site_id?: string | null;
  agent_identity_ref?: AgentIdentityRefV2 | null;
  control_path?: string | null;
  process_ownership?: Record<string, unknown> | null;
  runtime_pid?: number | null;
  attach_commands?: {
    agent_web_ui?: string | null;
    agent_cli?: string | null;
  };
}

export interface WorkspaceLaunchAttemptRecord {
  schema: 'narada.workspace_launch.attempt.v1';
  launch_attempt_id: string;
  ui_session_id: string;
  expected_launch_session_ids: string[];
  submitted_at: string;
  updated_at: string;
  selection: WorkspaceLaunchSelection;
  status: WorkspaceLaunchAttemptStatus;
  result_summary: string;
  plan_result_path: string | null;
  handoffs: WorkspaceLaunchHandoffRecord[];
  observations: WorkspaceLaunchObservationRecord[];
  projections: WorkspaceLaunchProjectionObservationRecord[];
  actions: string[];
  diagnostic: unknown;
}

export interface WorkspaceLaunchDashboardState {
  schema: 'narada.workspace_launch.ui_session_state.v1';
  ui_session: WorkspaceLaunchUiSessionRecord;
  attempts: WorkspaceLaunchAttemptRecord[];
  observed_unowned: unknown[];
  actions: string[];
}

export interface WorkspaceLaunchRecord {
  agent: string;
  agent_identity_ref: AgentIdentityRefV2;
  title: string;
  role: string;
  site: string;
  narada_root: string;
  site_root: string;
  workspace_root: string | null;
  launcher_path: string;
  operator_surface: string;
  carrier: string;
  runtime: string;
  authority: string | null;
  enable_native_shell: boolean;
  mcp_scope: string | null;
  config_path: string;
  legacy_site?: string | null;
}

export interface WorkspaceLaunchAgentPlan extends WorkspaceLaunchRecord {
  operator_surface_kind: string;
  runtime_host_kind: string;
  launch_operator_surface: string;
  launch_operator_surfaces: string[];
  launch_runtime_host: string;
  launch_runtime_hosts: string[];
  launch_carrier: string;
  launch_runtime: string;
  launch_carriers: string[];
  onboarding_mode: 'user-site' | null;
  launch_session_id: string | null;
  process_ownership: Record<string, unknown> | null;
  intelligence_provider: string | null;
  authority: string | null;
  wait_for_enter_before_exec: boolean;
  runtime_start_execution_mode: 'hidden_detached' | 'operator_terminal';
  runtime_start_command: string[];
  hidden_runtime_start_command: string[];
  runtime_start_cwd: string;
  mcp_scope: string;
  wt_args: string[];
  smoke_command: string[];
  operator_projection_launch_binding: Record<string, unknown> | null;
  operator_projection_open_requests: Array<Record<string, unknown>>;
  legacy_carrier_compatibility: WorkspaceLaunchLegacyCarrierCompatibility;
}

export interface WorkspaceLaunchRecordsLoad {
  records: WorkspaceLaunchRecord[];
  siteCatalog: ResolvedSiteRoot[];
}
