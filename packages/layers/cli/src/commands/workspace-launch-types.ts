import type { AgentIdentityRefV2 } from '@narada2/agent-identity';
import type { LaunchProcessOwnership } from '@narada2/launch-process-ownership';
import type {
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchAttemptStatus,
  WorkspaceLaunchDashboardState,
  WorkspaceLaunchHandoffRecord,
  WorkspaceLaunchObservationRecord,
  WorkspaceLaunchProjectionObservationRecord,
} from '@narada2/workspace-launch-contract';
export type {
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchAttemptStatus,
  WorkspaceLaunchDashboardState,
  WorkspaceLaunchHandoffRecord,
  WorkspaceLaunchObservationRecord,
  WorkspaceLaunchProjectionObservationRecord,
} from '@narada2/workspace-launch-contract';
import type { CliFormat } from '../lib/cli-output.js';
import type { ExitCode } from '../lib/exit-codes.js';
import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import type {
  WorkspaceLaunchSelection,
  WorkspaceLaunchSelectionMode,
  WorkspaceLaunchSelectorModel,
} from '@narada2/workspace-launch-contract';

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

export interface WorkspaceLaunchRuntimeStartResult {
  schema: 'narada.operator_surface.runtime_start_result.v1';
  status: string;
  mutation_performed: boolean;
  mode: string;
  operator_surface_kind: string;
  runtime_host_kind: string;
  target_site_id: string | null;
}

export type WorkspaceLauncherOutputProjection = 'summary' | 'events' | 'commands' | 'json' | 'quiet';

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
}

export interface WorkspaceLaunchSelectionSiteCatalogEntry {
  site_id: string | null;
  site_root: string;
  source: string;
}

export interface WorkspaceLaunchRememberedSelectionSemantics {
  schema: 'narada.workspace_launch.remembered_selection_semantics.v1';
  role: 'form_defaults_only';
  binds_runtime_session: false;
  binds_launch_session: false;
  launch_submission: 'always_creates_new_launch_session';
}

export interface WorkspaceLaunchSelectionUiModel {
  records: WorkspaceLaunchRecord[];
  siteChoices: string[];
  siteCatalog: WorkspaceLaunchSelectionSiteCatalogEntry[];
  rememberedSelection: WorkspaceLaunchSelection | null;
  rememberedSelectionSemantics: WorkspaceLaunchRememberedSelectionSemantics;
  initialSites: string[];
  initialRoles: string[];
  initialOperatorSurfaces: string[];
  initialRuntime: string;
  initialIntelligenceProvider: string;
  initialSelectionMode: WorkspaceLaunchSelectionMode;
  narsOperatorSurfaceChoices: string[];
  selectorModel: WorkspaceLaunchSelectorModel;
  explicitSelection: {
    site: boolean;
    role: boolean;
    operatorSurface: boolean;
    runtime: boolean;
    intelligenceProvider: boolean;
  };
}

export interface WorkspaceLaunchActionRefusalPayload {
  schema: 'narada.workspace_launch.action_refusal.v1';
  status: 'refused';
  reason_code: string;
  message: string;
  dashboard?: WorkspaceLaunchDashboardState;
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
  operator_projection_launch_binding: WorkspaceLaunchOperatorProjectionLaunchBinding | null;
  operator_projection_open_requests: WorkspaceLaunchOperatorProjectionOpenRequest[];
}

export interface WorkspaceLaunchOperatorProjectionLaunchBinding {
  schema: 'narada.operator_projection_launch_binding_ref.v1';
  path: string;
  exact_attach_required: true;
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
  interactive_selection: boolean;
  interactive_selection_surface: 'browser' | 'terminal' | null;
  count: number;
  windows_terminal_invoked: false;
  registry_paths: string[];
  selected_agents: WorkspaceLaunchAgentPlan[];
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
  command: string;
  args: string[];
  cwd: string;
  detached: boolean;
  stdio: string;
  windowsHide: boolean;
  pid: number | null;
  capture_log?: string;
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
  wt_exit_code?: number;
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
};

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

export interface WorkspaceLaunchUiSessionResult {
  schema: 'narada.workspace_launch.interactive_selection_ui_session.v1';
  status: string;
  mutation_performed: boolean;
  url: string;
  direct_url: string;
  router_url: string | null;
  stable_url: string | null;
  ingress_mode: string;
  ingress_reason: string | null;
  launch_count: number;
  registry_paths: string[];
  ownership: {
    planner: 'narada-cli';
    executor: 'narada-cli.workspace-launch';
    interactive_selection_surface: 'browser';
  };
}

export type WorkspaceLaunchPlanningResult = WorkspaceLaunchPlanResult | WorkspaceLaunchSmokeResult;

export type WorkspaceLaunchCommandOutput = WorkspaceLaunchPlanningResult | WorkspaceLaunchUiSessionResult | WorkspaceLaunchLaunchResult;

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
