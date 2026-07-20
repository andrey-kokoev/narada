import type { AgentIdentityRefV2 } from '@narada2/agent-identity';
import type { LaunchProcessOwnership } from '@narada2/launch-process-ownership';
import type { IntelligenceSelectionAuthority } from '@narada2/invokable-intelligence-contract';
import type { CliFormat } from '../lib/cli-output.js';
import type { ExitCode } from '../lib/exit-codes.js';
import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';

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
  mcpScope?: string;
  cloudflareApiBaseUrl?: string;
  resultPath?: string;
  suppressResultOutput?: boolean;
  enableNativeShell?: boolean;
  noWaitForEnterBeforeExec?: boolean;
  visibleRuntimeTerminal?: boolean;
  smoke?: boolean;
  dryRun?: boolean;
  format?: CliFormat;
}

export type WorkspaceLaunchSelectionResolutionSource =
  | 'explicit_selection'
  | 'registry_record'
  | 'registry_default'
  | 'command_default'
  | 'not_applicable';

export interface WorkspaceLaunchSelectionResolution {
  schema: 'narada.workspace_launch.selection_resolution.v1';
  operator_surfaces: {
    requested: string | null;
    resolved: string[];
    source: Exclude<WorkspaceLaunchSelectionResolutionSource, 'not_applicable'>;
  };
  runtime: {
    requested: string | null;
    resolved: string;
    source: Exclude<WorkspaceLaunchSelectionResolutionSource, 'not_applicable'>;
  };
  intelligence: IntelligenceSelectionAuthority;
  hidden_projection_launches?: WorkspaceLaunchProcessLaunch[];
}

export interface WorkspaceLaunchRuntimeStartResult {
  schema: 'narada.operator_surface.runtime_start_result.v1';
  status: string;
  mutation_performed: boolean;
  mode: string;
  operator_surface_kind: string;
  runtime_host_kind: string;
  target_site_id: string | null;
}

export type WorkspaceLaunchFormattedResult<T extends object> = T | (T & { _formatted: string });

export interface WorkspaceLaunchCommandResult<T extends object> {
  exitCode: ExitCode;
  result: WorkspaceLaunchFormattedResult<T>;
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
  runtime: string;
  authority: string | null;
  enable_native_shell: boolean;
  mcp_scope: string | null;
  config_path: string;
  legacy_site?: string | null;
}

export interface WorkspaceLaunchResultAgentInput {
  runtime_start_execution_mode?: unknown;
  hidden_runtime_start_command?: unknown;
  runtime_start_command?: unknown;
  runtime_start_cwd?: unknown;
  workspace_root?: unknown;
  site_root?: unknown;
}

export interface WorkspaceLaunchResultTerminalHandoffInput {
  wt_args?: unknown;
}

export interface WorkspaceLaunchResultRecord {
  count?: unknown;
  error?: unknown;
  reason?: unknown;
  result_path?: unknown;
  wt_exit_code?: unknown;
  hidden_runtime_invoked?: unknown;
  hidden_runtime_launches: unknown[];
  selected_agents: WorkspaceLaunchResultAgentInput[];
  wt_args?: unknown;
  operator_terminal_handoff?: WorkspaceLaunchResultTerminalHandoffInput | null;
  attachment?: unknown;
}

export interface WorkspaceLaunchAgentPlan extends WorkspaceLaunchRecord {
  operator_surface_kind: string;
  runtime_host_kind: string;
  launch_operator_surface: string;
  launch_operator_surfaces: string[];
  launch_runtime_host: string;
  launch_runtime_hosts: string[];
  launch_runtime: string;
  onboarding_mode: 'user-site' | null;
  launch_session_id: string | null;
  process_ownership: LaunchProcessOwnership | null;
  intelligence_selection_authority: IntelligenceSelectionAuthority;
  capability_admission: Record<string, unknown>;
  path_provenance: Record<string, unknown>;
  selection_resolution: WorkspaceLaunchSelectionResolution;
  authority: string | null;
  wait_for_enter_before_exec: boolean;
  runtime_start_execution_mode: 'hidden_detached' | 'operator_terminal';
  runtime_start_command: string[];
  hidden_runtime_start_command: string[];
  operator_projection_start_command?: string[];
  runtime_start_cwd: string;
  terminal_tabs: Array<{
    title: string;
    cwd: string;
    command: string;
    command_argv: string[];
    command_authority: 'projection_only';
    keepOpen: boolean;
  }>;
  transaction: Record<string, unknown>;
  mcp_scope: string;
  wt_args: string[];
  smoke_command: string[];
  operator_projection_launch_binding: WorkspaceLaunchOperatorProjectionLaunchBinding | null;
  operator_projection_open_requests: WorkspaceLaunchOperatorProjectionOpenRequest[];
}

export interface WorkspaceLaunchOperatorProjectionLaunchBinding {
  schema: 'narada.operator_projection_launch_binding_ref.v1';
  path: string;
  exact_attach_required: true;
  lease: {
    schema: 'narada.operator_projection_attachment_lease.v1';
    launch_session_id: string | null;
    binding_path: string;
    exact_session: true;
    exact_endpoint: true;
    endpoint_resolution: 'session_started.health_endpoint_and_events_endpoint';
  };
}

export interface WorkspaceLaunchOperatorProjectionOpenRequest {
  schema: 'narada.operator_projection_open_request.v1';
  status: 'planned';
  projection_kind: 'browser_url';
  target_ref: null;
  target_ref_resolution: string;
  purpose: 'agent_web_ui_attach';
  caller: {
    package: '@narada2/cli';
    command: 'workspace launch';
    module: 'commands/launcher';
  };
  mode: 'execute';
  policy: {
    allow_visible_host_effect: true;
    suppress_reason: null;
  };
  mutation_performed: false;
  launch_agent: string;
  launch_site: string;
}

export interface WorkspaceLaunchRecordsLoad {
  records: WorkspaceLaunchRecord[];
  siteCatalog: ResolvedSiteRoot[];
}

export interface WorkspaceLaunchPlanResult {
  schema: 'narada.workspace_launch.plan.v1';
  status: 'planned';
  mutation_performed: false;
  mode: 'plan' | 'dry_run';
  count: number;
  windows_terminal_invoked: false;
  registry_paths: string[];
  selected_agents: WorkspaceLaunchAgentPlan[];
  transaction: Record<string, unknown>;
  wt_args: string[];
  ownership: {
    planner: 'narada-cli';
    executor: 'narada-cli.workspace-launch';
    migrated_from: string;
  };
  result_path?: string;
  suppress_result_output?: boolean;
}

export interface WorkspaceLaunchProcessLaunch {
  posture: string;
  execution_authority: 'structured_argv' | 'projection_shell_string';
  command: string;
  args: string[];
  cwd: string;
  detached: boolean;
  stdio: string;
  windowsHide: boolean;
  pid: number | null;
  owner_ref: string | null;
  agent_id?: string | null;
  launch_session_id?: string | null;
  nars_session_id?: string | null;
  launch_binding_path?: string | null;
  readiness_path?: string | null;
  readiness?: 'spawned' | 'spawned_and_alive' | 'not_checked';
  readiness_checked_at?: string | null;
  capture_log?: string;
}

export type WorkspaceLaunchAttachmentStatus = 'attached' | 'handoff_pending' | 'not_checked';

export interface WorkspaceLaunchAttachmentEvidence {
  schema: 'narada.workspace_launch.attachment.v1';
  status: WorkspaceLaunchAttachmentStatus;
  exact_session: boolean;
  launch_session_ids: string[];
  sessions: Array<{
    launch_session_id: string;
    session_id: string | null;
    health_session_id: string | null;
    health_identity_match: boolean;
    expected_agent_id?: string | null;
    observed_agent_id?: string | null;
    expected_site_id?: string | null;
    observed_site_id?: string | null;
    health_agent_id?: string | null;
    health_site_id?: string | null;
    canonical_identity_match?: boolean;
    site_root: string | null;
    event_endpoint: string | null;
    health_endpoint: string | null;
    health_status: 'healthy' | 'unavailable' | 'not_checked';
    attempts: number;
    reason?: string;
  }>;
  required_next_step: string | null;
}

export interface WorkspaceLaunchFailureEvidence {
  schema: 'narada.workspace_launch.failure_evidence.v1';
  stage: string;
  reason_code: string;
  message: string;
  error_type: string;
  required_next_step: string;
  retryable: boolean;
  artifact_path: string | null;
  artifact_status: 'written' | 'not_requested' | 'write_failed';
  rollback: import('./workspace-launch-contracts.js').WorkspaceLaunchRollbackEvidence;
  hidden_runtime_launches: WorkspaceLaunchProcessLaunch[];
  hidden_projection_launches: WorkspaceLaunchProcessLaunch[];
  attachment: WorkspaceLaunchAttachmentEvidence | null;
  operator_terminal_handoff: {
    status: 'not_attempted' | 'accepted' | 'failed';
    wt_exit_code: number | null;
    wt_args: string[];
  };
}

export interface WorkspaceLaunchTerminalHandoff {
  schema: 'narada.workspace_launch.operator_terminal_handoff.v1';
  authority: 'narada-cli.workspace-launch-executor';
  wt_args: string[];
}

export interface WorkspaceLaunchInvocationDetails {
  windows_terminal_invoked: boolean;
  hidden_runtime_invoked: boolean;
  hidden_runtime_launches?: WorkspaceLaunchProcessLaunch[];
  hidden_projection_launches?: WorkspaceLaunchProcessLaunch[];
  wt_exit_code?: number;
  attachment: WorkspaceLaunchAttachmentEvidence;
}

export type WorkspaceLaunchLaunchResult = Omit<
  WorkspaceLaunchPlanResult,
  'schema' | 'status' | 'mutation_performed' | 'mode' | 'windows_terminal_invoked' | 'wt_args'
> & {
  schema: 'narada.workspace_launch.launch_result.v1';
  status: 'launched';
  mutation_performed: true;
  mode: 'launch';
  windows_terminal_invoked: boolean;
  launch_agents: WorkspaceLaunchAgentPlan[];
  selected_agents_authority: 'narada-cli.plan_selection';
  hidden_runtime_invoked: boolean;
  hidden_runtime_launches?: WorkspaceLaunchProcessLaunch[];
  launcher_execution_owner: 'narada-cli';
  wt_exit_code?: number;
  operator_terminal_handoff?: WorkspaceLaunchTerminalHandoff;
  attachment: WorkspaceLaunchAttachmentEvidence;
  hidden_projection_launches?: WorkspaceLaunchProcessLaunch[];
};

export interface WorkspaceLaunchFailureResult {
  schema: 'narada.workspace_launch.failure.v1';
  status: 'failed';
  mutation_performed: false;
  mode: 'launch';
  count: number;
  windows_terminal_invoked: boolean;
  registry_paths: string[];
  selected_agents: WorkspaceLaunchAgentPlan[];
  transaction: Record<string, unknown>;
  wt_args: string[];
  ownership: WorkspaceLaunchPlanResult['ownership'];
  result_path?: string;
  suppress_result_output?: boolean;
  failure: WorkspaceLaunchFailureEvidence;
}

export interface WorkspaceLaunchExecutionResult {
  plan: WorkspaceLaunchPlanResult;
  invocation: WorkspaceLaunchInvocationDetails;
}

export interface WorkspaceLaunchSmokeAgentResult {
  agent: string;
  site: string;
  operator_surface: string;
  runtime: string;
  status: 'passed' | 'failed';
  plan: WorkspaceLaunchAgentPlan;
  operator_surface_runtime_start: WorkspaceLaunchRuntimeStartResult;
  operator_surface_start: WorkspaceLaunchRuntimeStartResult;
}

export interface WorkspaceLaunchSmokeResult {
  schema: 'narada.workspace_launch.smoke.v1';
  status: 'passed' | 'failed';
  mutation_performed: false;
  count: number;
  windows_terminal_invoked: false;
  mcp_initialization: {
    status: 'not_executed_in_dry_run';
    reason: string;
  };
  registry_paths: string[];
  agents: WorkspaceLaunchSmokeAgentResult[];
  ownership: {
    planner: 'narada-cli';
    smoke_aggregator: 'narada-cli';
    executor: 'none';
    migrated_from: string;
  };
  result_path?: string;
  suppress_result_output?: boolean;
}

export type WorkspaceLaunchPlanningResult = WorkspaceLaunchPlanResult | WorkspaceLaunchSmokeResult;

export type WorkspaceLaunchCommandOutput = WorkspaceLaunchPlanningResult | WorkspaceLaunchLaunchResult;

export function isWorkspaceLaunchPlanResult(value: unknown): value is WorkspaceLaunchPlanResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkspaceLaunchPlanResult>;
  return candidate.schema === 'narada.workspace_launch.plan.v1'
    && candidate.status === 'planned'
    && candidate.mutation_performed === false
    && (candidate.mode === 'plan' || candidate.mode === 'dry_run')
    && candidate.windows_terminal_invoked === false
    && Array.isArray(candidate.selected_agents)
    && Array.isArray(candidate.wt_args);
}
