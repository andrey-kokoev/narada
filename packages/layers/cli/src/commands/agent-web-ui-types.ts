import type { EnsureOperatorRouterOptions, EnsureOperatorRouterResult, OperatorRouterAdminOptions } from '@narada2/operator-router';
import type { CliFormat } from '../lib/cli-output.js';
import type { JsonRecord } from '../lib/launcher-contracts.js';
import type { AgentWebUiAttachmentLifecycle } from './agent-web-ui-attachment-state.js';

export interface AgentWebUiAttachOptions {
  session?: string;
  agent?: string;
  site?: string;
  siteRoot?: string;
  host?: string;
  port?: number;
  dryRun?: boolean;
  diagnose?: boolean;
  allowStaleSession?: boolean;
  inspectStaleSession?: boolean;
  healthTimeoutMs?: number;
  waitForSessionMs?: number;
  launchBindingPath?: string;
  format?: CliFormat;
  launchRegistryPath?: string;
  open?: boolean;
  onboarding?: boolean;
  cloudflareApiBaseUrl?: string;
}

export type NarsSessionsCommand = typeof import('./nars.js').narsSessionsCommand;
export type NarsAttachCommand = typeof import('./nars.js').narsAttachCommandCommand;

export interface ResolvedAttachSession {
  sessionId: string;
  reason: string | null;
}

export interface AttachSessionCandidate {
  session_id: string | null;
  agent_id: string | null;
  agent_identity_ref: JsonRecord | null;
  site_id: string | null;
  site_root: string | null;
  display_state: string | null;
  terminal_state: string | null;
  health_status: string | null;
  started_at: string | null;
}

export type AttachSessionDiscoveryReason =
  | 'nars_session_not_found_for_agent'
  | 'nars_session_ambiguous_for_agent'
  | 'session_discovery_failed'
  | 'launch_binding_unresolved'
  | 'launch_binding_failed';

export type ProgressReporter = (line: string) => void;

export interface AttachabilityResult {
  status: 'attachable' | 'not_attachable';
  reason: string | null;
  health_status: string | null;
}

export interface AuthorityTransitionSnapshot {
  authority_runtime_host: string | null;
  authority_epoch: number | null;
  authority_runtime_id: string | null;
  authority_transition_state: string | null;
  source_write_admission: string | null;
  superseded_by_session_id: string | null;
  authority_locator_ref: string | null;
  target_authority_locator: JsonRecord | null;
  stale_source: boolean;
  input_policy: 'enabled' | 'disabled_source_sealed';
  reattach: {
    target_session_id: string | null;
    target_locator_ref: string | null;
    target_authority_locator: JsonRecord | null;
  } | null;
}

export interface AgentWebUiAttachPlan {
  schema: 'narada.agent_web_ui.attach_plan.v1';
  status: 'planned' | 'started' | 'attached';
  session_id: string;
  site_root: string | null;
  site_root_source: string | null;
  site_id: string | null;
  event_endpoint: string;
  health_endpoint: string | null;
  host: string;
  port: number;
  url: string | null;
  ingress_mode: 'operator-router' | 'diagnostic';
  router_url: string | null;
  public_path: string | null;
  public_event_endpoint: string | null;
  public_health_endpoint: string | null;
  backend_url: string | null;
  route_ids: string[];
  command: string;
  authority_transition: AuthorityTransitionSnapshot;
  attachment_lifecycle: AgentWebUiAttachmentLifecycle;
  onboarding_mode: 'user-site' | null;
  operator_projection_open_request?: JsonRecord;
}

export interface AgentWebUiServerStartOptions {
  host: string;
  port: number;
  eventEndpoint: string;
  healthEndpoint: string | null;
  sessionId: string;
  siteRoot: string | null;
  siteId: string | null;
  agentId: string | null;
  authorityTransition?: AuthorityTransitionSnapshot;
  onboarding?: boolean;
  cloudflareApiBaseUrl: string | null;
  publicBasePath?: string | null;
  publicEventEndpoint?: string | null;
  publicHealthEndpoint?: string | null;
  publicArtifactBasePath?: string | null;
  publicArtifactTransport?: string | null;
}

export interface AgentWebUiAttachDependencies {
  discoverSessions?: NarsSessionsCommand;
  resolveAttachEndpoints?: NarsAttachCommand;
  startAgentWebUiServer?: (options: AgentWebUiServerStartOptions) => Promise<{ url: string; server?: unknown }>;
  ensureOperatorRouter?: (options?: EnsureOperatorRouterOptions) => Promise<EnsureOperatorRouterResult>;
  registerOperatorRoute?: typeof import('@narada2/operator-router').registerOperatorRoute;
  openUrl?: (url: string) => Promise<void> | void;
  progress?: ProgressReporter;
  operatorRouterAdmin?: OperatorRouterAdminOptions;
}
