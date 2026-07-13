import type { AgentIdentityRefV2 } from '@narada2/agent-identity';
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

export type WorkspaceLauncherOutputProjection = 'summary' | 'events' | 'commands' | 'json' | 'quiet';

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
}

export interface WorkspaceLaunchRecordsLoad {
  records: WorkspaceLaunchRecord[];
  siteCatalog: ResolvedSiteRoot[];
}
