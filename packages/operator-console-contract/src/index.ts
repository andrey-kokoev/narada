export const OPERATOR_SURFACE_DESCRIPTOR_SCHEMA = 'narada.operator.surface_descriptor.v3' as const;
export const OPERATOR_WORKSPACE_ROUTE_DIRECTORY_SCHEMA = 'narada.operator_workspace.route_directory.v3' as const;
export const OPERATOR_WORKSPACE_ROUTE_DIRECTORY_PATH = '/console/routes' as const;
export const OPERATOR_CONSOLE_PATH = '/console' as const;
export const OPERATOR_CONSOLE_REGISTRY_PATH = '/console/registry' as const;
export const OPERATOR_CONSOLE_REGISTRY_API_PATH = `${OPERATOR_CONSOLE_REGISTRY_PATH}/api` as const;
export const OPERATOR_CONSOLE_REGISTRY_ADD_PATH = `${OPERATOR_CONSOLE_REGISTRY_PATH}/add` as const;
export const OPERATOR_CONSOLE_REGISTRY_MANAGE_PATH = `${OPERATOR_CONSOLE_REGISTRY_PATH}/manage` as const;
export const OPERATOR_CONSOLE_LAUNCH_PATH = `${OPERATOR_CONSOLE_PATH}/launch` as const;
export const OPERATOR_CONSOLE_LAUNCH_API_PATH = `${OPERATOR_CONSOLE_LAUNCH_PATH}/api` as const;
export const OPERATOR_CONSOLE_LAUNCH_SESSIONS_PATH = `${OPERATOR_CONSOLE_LAUNCH_PATH}/sessions` as const;
export const OPERATOR_CONSOLE_AGENTS_PATH = `${OPERATOR_CONSOLE_PATH}/agents` as const;
export const OPERATOR_CONSOLE_AGENTS_API_PATH = `${OPERATOR_CONSOLE_AGENTS_PATH}/api` as const;
export const OPERATOR_CONSOLE_ONBOARDING_PATH = `${OPERATOR_CONSOLE_PATH}/onboarding` as const;
export const OPERATOR_CONSOLE_ONBOARDING_API_PATH = `${OPERATOR_CONSOLE_ONBOARDING_PATH}/api` as const;
export const OPERATOR_CONSOLE_SESSIONS_PATH = `${OPERATOR_CONSOLE_PATH}/sessions` as const;
export const OPERATOR_CONSOLE_SESSIONS_API_PATH = `${OPERATOR_CONSOLE_SESSIONS_PATH}/api` as const;
export const OPERATOR_CONSOLE_ASSET_PATH = '/console/assets' as const;
export const OPERATOR_WORKSPACE_ROUTE_DIRECTORY_TIMEOUT_MS = 10_000;
export const OPERATOR_CONSOLE_LONG_RUNNING_REQUEST_TIMEOUT_MS = 120_000;

export type OperatorSurfaceId =
  | 'site-registry'
  | 'site-agents'
  | 'launcher'
  | 'site-operations'
  | 'agent-sessions'
  | 'artifacts'
  | 'onboarding';

export type OperatorSurfaceScope =
  | 'user-site'
  | 'operator-console'
  | 'local-site'
  | 'nars-session';

export type OperatorSurfaceAuthorityKind =
  | 'user-site'
  | 'operator-console'
  | 'site'
  | 'nars-session-index'
  | 'nars-session'
  | 'artifact';

export interface OperatorSurfaceAuthorityRef {
  kind: OperatorSurfaceAuthorityKind;
  id: string | null;
}

export type OperatorSiteAgentHandoffKind = 'browser' | 'terminal' | 'none';
export type OperatorSiteAgentHandoffStatus = 'ready' | 'started' | 'pending' | 'refused';

export interface OperatorSiteAgentLaunchHandoffWireRecord {
  kind: OperatorSiteAgentHandoffKind;
  status: OperatorSiteAgentHandoffStatus;
  url: string | null;
  command: string | null;
  message: string | null;
}

export type OperatorSurfaceHostKind = 'local' | 'cloudflare';

export interface OperatorSurfaceHostRef {
  kind: OperatorSurfaceHostKind;
  id: string;
  origin: string | null;
}

export type OperatorSurfaceProjectionKind =
  | 'workspace'
  | 'registry'
  | 'site-agent-overview'
  | 'launcher'
  | 'site-operations'
  | 'session-inventory'
  | 'agent-session'
  | 'artifact'
  | 'diagnostic';

export interface OperatorSurfaceProjectionBinding {
  kind: OperatorSurfaceProjectionKind;
  owner: string;
}

export type OperatorSurfaceIntentKind =
  | 'none'
  | 'registry-workflow'
  | 'agent-launch'
  | 'launcher-control'
  | 'onboarding-control'
  | 'site-control'
  | 'session-input'
  | 'artifact-open';

export type OperatorSurfaceIntentProtocol = 'http' | 'websocket' | 'mcp';

export type OperatorSurfaceIntentEndpointBase = 'workspace' | 'authority';

export interface OperatorSurfaceIntentBinding {
  kind: OperatorSurfaceIntentKind;
  endpoint: string | null;
  endpointBase: OperatorSurfaceIntentEndpointBase | null;
  protocols: readonly OperatorSurfaceIntentProtocol[];
}

export type OperatorSurfaceAvailability = 'available' | 'unavailable' | 'planned';

export type OperatorSurfaceRouteKind = 'page' | 'workflow';

export type OperatorSurfaceNavigationKey = 'agents' | 'sites' | 'add' | 'manage' | 'launcher' | 'sessions' | 'onboarding';

export interface OperatorSurfaceNavigationItem {
  key: OperatorSurfaceNavigationKey;
  label: string;
  href: string;
}

export function isOperatorWorkspaceRoutePath(value: unknown): value is string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.trim() !== value
    || !value.startsWith('/')
    || value.startsWith('//')
    || value.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(value)) return false;
  return true;
}

function projectedRouteDetail(availability: OperatorSurfaceAvailability): string {
  if (availability === 'available') return 'Route is available from this host.';
  if (availability === 'unavailable') return 'Route is not currently reachable from this host.';
  return 'Route is declared but not currently available from this host.';
}

export type OperatorSessionDisplayState =
  | 'active'
  | 'starting_or_degraded'
  | 'closed'
  | 'stale'
  | 'historical';

export interface OperatorSurfaceRouteDescriptor {
  id: string;
  path: string;
  kind: OperatorSurfaceRouteKind;
  label: string;
  navigationKey?: OperatorSurfaceNavigationKey;
  target?: OperatorSurfaceRouteTarget;
}

export type OperatorSurfaceRouteTargetKind = 'site' | 'session' | 'artifact';

export interface OperatorSurfaceRouteTarget {
  kind: OperatorSurfaceRouteTargetKind;
  id: string;
}

export interface OperatorSurfaceRouteProjection extends OperatorSurfaceRouteDescriptor {
  availability: OperatorSurfaceAvailability;
  projectedDetail: string;
  authority: OperatorSurfaceAuthorityRef;
  authorityHost: OperatorSurfaceHostRef;
  projection: OperatorSurfaceProjectionBinding;
  intent: OperatorSurfaceIntentBinding;
  diagnosticOnly: boolean;
  legacyReplacement?: string;
}

export interface OperatorSessionWireRecord {
  session_id: string;
  site_id: string | null;
  agent_id: string | null;
  runtime_kind: string | null;
  launch_operator_surface_kind: string | null;
  started_at: string | null;
  last_seen_at: string | null;
  terminal_state: string | null;
  display_state: OperatorSessionDisplayState;
  display_state_reason: string;
  heartbeat_fresh: boolean;
  heartbeat_age_ms: number | null;
  health_status: string;
}

export interface OperatorSessionListWireResponse {
  schema: 'narada.operator_console.agent_sessions.v1';
  status: 'success' | 'refused';
  generated_at: string;
  count: number;
  sessions: OperatorSessionWireRecord[];
  refusals: string[];
}

export type OperatorSiteAgentGroupId = 'personal-infrastructure' | 'sites';
export type OperatorSiteKind = 'user_site' | 'pc_site' | 'site';
export type OperatorSiteClassificationSource = 'declared' | 'registry' | 'fallback' | 'registry_only';
export type OperatorAgentRuntimeState = 'running' | 'degraded' | 'stopped' | 'ambiguous';
export type OperatorSiteAgentSurfaceKind = 'agent-web-ui' | 'agent-cli' | 'agent-tui';
export type OperatorSiteAgentSurfaceStatus = 'available' | 'unavailable';

export interface OperatorSiteAgentSurfaceOption {
  kind: OperatorSiteAgentSurfaceKind;
  label: string;
  status: OperatorSiteAgentSurfaceStatus;
  reason: string | null;
}

export interface OperatorSiteAgentSurfaceWireState {
  /** The configured launch default; it may be outside the compact selector. */
  default_kind: string;
  choices: OperatorSiteAgentSurfaceOption[];
}

export interface OperatorSiteAgentRuntimeWireState {
  state: OperatorAgentRuntimeState;
  session_count: number;
  healthy_session_ids: string[];
  selected_session_id: string | null;
}

export interface OperatorSiteAgentWorkWireState {
  state: string;
  detail: string | null;
  source: 'principal-runtime' | 'unavailable';
}

export interface OperatorSiteAgentWireRecord {
  agent_id: string;
  local_agent_id: string;
  title: string;
  role: string;
  admission_status: 'admitted';
  runtime: OperatorSiteAgentRuntimeWireState;
  work: OperatorSiteAgentWorkWireState;
  operator_surfaces: OperatorSiteAgentSurfaceWireState;
  actions: {
    start: boolean;
    inspect: boolean;
    inspect_reason: string | null;
  };
}

export interface OperatorSiteAgentSiteWireRecord {
  site_id: string;
  display_name: string;
  site_kind: OperatorSiteKind;
  classification_source?: OperatorSiteClassificationSource;
  group_id: OperatorSiteAgentGroupId;
  observation_status: string;
  agents: OperatorSiteAgentWireRecord[];
}

export interface OperatorSiteAgentGroupWireRecord {
  id: OperatorSiteAgentGroupId;
  label: string;
  sites: OperatorSiteAgentSiteWireRecord[];
}

export interface OperatorSiteAgentOverviewWireResponse {
  schema: 'narada.operator_console.site_agent_overview.v1';
  status: 'success' | 'refused';
  generated_at: string;
  groups: OperatorSiteAgentGroupWireRecord[];
  refusals: string[];
}

export type OperatorSiteAgentLaunchFailurePhase =
  | 'overview_read'
  | 'launch_record_read'
  | 'web_ui_attach'
  | 'workspace_launch'
  | 'admission';

export interface OperatorSiteAgentLaunchFailureWireRecord {
  phase: OperatorSiteAgentLaunchFailurePhase;
  code: string;
  message: string;
  diagnostic_ref: string | null;
}

export interface OperatorSiteAgentLaunchWireResponse {
  schema: 'narada.operator_console.agent_launch.v1';
  status: 'launched' | 'reused' | 'refused' | 'failed';
  site_id: string;
  agent_id: string;
  session_id: string | null;
  reason: string | null;
  /** Effective surface after defaulting and admission. */
  operator_surface?: string;
  handoff?: OperatorSiteAgentLaunchHandoffWireRecord;
  request_id?: string;
  failure?: OperatorSiteAgentLaunchFailureWireRecord | null;
}

export interface OperatorSiteAgentInvariantViolation {
  invariant: string;
  path: string;
  detail: string;
}

/**
 * Semantic invariants between Site, agent, runtime, and session state. Shape
 * parsing alone cannot catch these: a well-formed payload can still claim a
 * running agent with no healthy session or a stopped agent with one attached.
 */
export function validateOperatorSiteAgentOverviewInvariants(
  overview: OperatorSiteAgentOverviewWireResponse,
): OperatorSiteAgentInvariantViolation[] {
  const violations: OperatorSiteAgentInvariantViolation[] = [];
  const push = (invariant: string, path: string, detail: string) => {
    violations.push({ invariant, path, detail });
  };
  const seenGroupIds = new Set<string>();
  const seenSiteIds = new Set<string>();
  const seenCanonicalAgentIds = new Set<string>();
  overview.groups.forEach((group, groupIndex) => {
    const groupPath = `groups[${groupIndex}]`;
    if (seenGroupIds.has(group.id)) push('duplicate_group_id', groupPath, `${group.id} appears more than once`);
    seenGroupIds.add(group.id);
    group.sites.forEach((site, siteIndex) => {
      const sitePath = `groups[${groupIndex}].sites[${siteIndex}]`;
      const siteKey = site.site_id.toLowerCase();
      if (seenSiteIds.has(siteKey)) push('duplicate_site_id', sitePath, `${site.site_id} appears more than once`);
      seenSiteIds.add(siteKey);
      const expectedGroup: OperatorSiteAgentGroupId = site.site_kind === 'site' ? 'sites' : 'personal-infrastructure';
      if (group.id !== expectedGroup || site.group_id !== expectedGroup) {
        push('group_kind_mismatch', sitePath, `${site.site_id}: kind ${site.site_kind} does not belong in group ${group.id}`);
      }
      site.agents.forEach((agent, agentIndex) => {
        const agentPath = `${sitePath}.agents[${agentIndex}]`;
        const expectedAgentId = `${site.site_id}.${agent.local_agent_id}`;
        if (agent.agent_id !== expectedAgentId) {
          push('agent_id_form', agentPath, `${agent.agent_id} is not the canonical ${expectedAgentId}`);
        }
        const agentKey = agent.agent_id.toLowerCase();
        if (seenCanonicalAgentIds.has(agentKey)) push('duplicate_agent_id', agentPath, `${agent.agent_id} appears more than once`);
        seenCanonicalAgentIds.add(agentKey);
        const runtime = agent.runtime;
        const surfaceKinds = agent.operator_surfaces.choices.map((choice) => choice.kind);
        if (new Set(surfaceKinds).size !== surfaceKinds.length) {
          push('operator_surface_choices_unique', agentPath, 'operator surface choices must be unique');
        }
        if (surfaceKinds.length !== 3
          || !surfaceKinds.includes('agent-web-ui')
          || !surfaceKinds.includes('agent-cli')
          || !surfaceKinds.includes('agent-tui')) {
          push('operator_surface_choices_complete', agentPath, 'the compact selector must expose web UI, CLI, and TUI');
        }
        const healthySessionIds = new Set(runtime.healthy_session_ids);
        if (healthySessionIds.size !== runtime.healthy_session_ids.length) {
          push('duplicate_healthy_session_id', agentPath, 'healthy_session_ids must be unique');
        }
        if (runtime.session_count < runtime.healthy_session_ids.length) {
          push('runtime_session_cardinality', agentPath, 'session_count cannot be less than healthy session count');
        }
        if (runtime.selected_session_id !== null && !runtime.healthy_session_ids.includes(runtime.selected_session_id)) {
          push('selected_not_healthy', agentPath, `selected session ${runtime.selected_session_id} is not among the healthy sessions`);
        }
        if (runtime.state === 'running') {
          if (runtime.healthy_session_ids.length !== 1 || runtime.selected_session_id !== runtime.healthy_session_ids[0]) {
            push('runtime_running_shape', agentPath, 'running requires exactly one healthy session selected');
          }
          if (runtime.session_count < 1) push('runtime_running_shape', agentPath, 'running requires at least one session');
          if (!agent.actions.inspect) push('action_state_mismatch', agentPath, 'running implies inspect is available');
          if (agent.actions.start) push('action_state_mismatch', agentPath, 'running forbids start');
        }
        if (runtime.state === 'stopped') {
          if (runtime.session_count !== 0 || runtime.healthy_session_ids.length !== 0 || runtime.selected_session_id !== null) {
            push('runtime_stopped_shape', agentPath, 'stopped forbids sessions');
          }
          if (!agent.actions.start) push('action_state_mismatch', agentPath, 'stopped implies start is available');
          if (agent.actions.inspect) push('action_state_mismatch', agentPath, 'stopped forbids inspect');
        }
        if (runtime.state === 'ambiguous') {
          if (runtime.healthy_session_ids.length < 2) push('runtime_ambiguous_shape', agentPath, 'ambiguous requires more than one healthy session');
          if (runtime.selected_session_id !== null) push('runtime_ambiguous_shape', agentPath, 'ambiguous forbids a selected session');
        }
        if (runtime.state === 'degraded') {
          if (runtime.selected_session_id !== null || runtime.healthy_session_ids.length !== 0 || runtime.session_count < 1) {
            push('runtime_degraded_shape', agentPath, 'degraded requires active sessions, no healthy sessions, and no selected session');
          }
        }
        if ((runtime.state === 'ambiguous' || runtime.state === 'degraded') && (agent.actions.start || agent.actions.inspect)) {
          push('action_state_mismatch', agentPath, `${runtime.state} forbids start and inspect`);
        }
      });
    });
  });
  return violations;
}

export function formatOperatorSiteAgentInvariantViolation(violation: OperatorSiteAgentInvariantViolation): string {
  return `invariant_violation:${violation.invariant}:${violation.path}`;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyWireString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function parseSiteAgentRuntime(value: unknown): OperatorSiteAgentRuntimeWireState | null {
  const row = recordValue(value);
  if (!row
    || !['running', 'degraded', 'stopped', 'ambiguous'].includes(String(row.state))
    || typeof row.session_count !== 'number'
    || !Number.isInteger(row.session_count)
    || row.session_count < 0
    || !Array.isArray(row.healthy_session_ids)
    || !row.healthy_session_ids.every((item) => nonEmptyWireString(item) !== null)
    || (row.selected_session_id !== null && nonEmptyWireString(row.selected_session_id) === null)) return null;
  return row as unknown as OperatorSiteAgentRuntimeWireState;
}

function parseSiteAgentSurfaces(value: unknown): OperatorSiteAgentSurfaceWireState | null {
  const row = recordValue(value);
  if (!row || !nonEmptyWireString(row.default_kind) || !Array.isArray(row.choices)) return null;
  const choices = row.choices.map((value): OperatorSiteAgentSurfaceOption | null => {
    const choice = recordValue(value);
    if (!choice
      || !['agent-web-ui', 'agent-cli', 'agent-tui'].includes(String(choice.kind))
      || !nonEmptyWireString(choice.label)
      || !['available', 'unavailable'].includes(String(choice.status))
      || (choice.reason !== null && typeof choice.reason !== 'string')) return null;
    return choice as unknown as OperatorSiteAgentSurfaceOption;
  });
  if (choices.some((choice) => choice === null)) return null;
  return { ...row, choices: choices as OperatorSiteAgentSurfaceOption[] } as unknown as OperatorSiteAgentSurfaceWireState;
}

function parseSiteAgent(value: unknown): OperatorSiteAgentWireRecord | null {
  const row = recordValue(value);
  const runtime = parseSiteAgentRuntime(row?.runtime);
  const work = recordValue(row?.work);
  const operatorSurfaces = parseSiteAgentSurfaces(row?.operator_surfaces);
  const actions = recordValue(row?.actions);
  if (!row || !runtime || !work || !operatorSurfaces || !actions
    || !nonEmptyWireString(row.agent_id)
    || !nonEmptyWireString(row.local_agent_id)
    || !nonEmptyWireString(row.title)
    || !nonEmptyWireString(row.role)
    || row.admission_status !== 'admitted'
    || !nonEmptyWireString(work.state)
    || (work.detail !== null && typeof work.detail !== 'string')
    || (work.source !== 'principal-runtime' && work.source !== 'unavailable')
    || typeof actions.start !== 'boolean'
    || typeof actions.inspect !== 'boolean'
    || (actions.inspect_reason !== null && typeof actions.inspect_reason !== 'string')) return null;
  return { ...row, operator_surfaces: operatorSurfaces } as unknown as OperatorSiteAgentWireRecord;
}

function parseSiteAgentSite(value: unknown): OperatorSiteAgentSiteWireRecord | null {
  const row = recordValue(value);
  if (!row
    || !nonEmptyWireString(row.site_id)
    || !nonEmptyWireString(row.display_name)
    || !['user_site', 'pc_site', 'site'].includes(String(row.site_kind))
    || (row.classification_source !== undefined
      && !['declared', 'registry', 'fallback', 'registry_only'].includes(String(row.classification_source)))
    || !['personal-infrastructure', 'sites'].includes(String(row.group_id))
    || !nonEmptyWireString(row.observation_status)
    || !Array.isArray(row.agents)) return null;
  const agents = row.agents.map(parseSiteAgent);
  if (agents.some((agent) => agent === null)) return null;
  return { ...row, agents: agents as OperatorSiteAgentWireRecord[] } as unknown as OperatorSiteAgentSiteWireRecord;
}

export function parseOperatorSiteAgentOverviewWireResponse(value: unknown): OperatorSiteAgentOverviewWireResponse | null {
  const row = recordValue(value);
  if (!row
    || row.schema !== 'narada.operator_console.site_agent_overview.v1'
    || (row.status !== 'success' && row.status !== 'refused')
    || !nonEmptyWireString(row.generated_at)
    || !Array.isArray(row.groups)
    || !Array.isArray(row.refusals)
    || !row.refusals.every((item) => typeof item === 'string')) return null;
  const groups = row.groups.map((group): OperatorSiteAgentGroupWireRecord | null => {
    const groupRow = recordValue(group);
    if (!groupRow
      || !['personal-infrastructure', 'sites'].includes(String(groupRow.id))
      || !nonEmptyWireString(groupRow.label)
      || !Array.isArray(groupRow.sites)) return null;
    const sites = groupRow.sites.map(parseSiteAgentSite);
    if (sites.some((site) => site === null)) return null;
    return { ...groupRow, sites: sites as OperatorSiteAgentSiteWireRecord[] } as unknown as OperatorSiteAgentGroupWireRecord;
  });
  if (groups.some((group) => group === null)) return null;
  const parsed = { ...row, groups: groups as OperatorSiteAgentGroupWireRecord[] } as unknown as OperatorSiteAgentOverviewWireResponse;
  return validateOperatorSiteAgentOverviewInvariants(parsed).length > 0 ? null : parsed;
}

export interface OperatorSurfaceAvailabilityDetail {
  available: string;
  unavailable: string;
  planned: string;
}

export interface OperatorSurfaceAction {
  href: string;
  label: string;
}

export interface OperatorSurfaceDescriptor {
  schema: typeof OPERATOR_SURFACE_DESCRIPTOR_SCHEMA;
  id: OperatorSurfaceId;
  name: string;
  scope: OperatorSurfaceScope;
  owner: string;
  authority: OperatorSurfaceAuthorityRef;
  authorityHost: OperatorSurfaceHostRef;
  projection: OperatorSurfaceProjectionBinding;
  intent: OperatorSurfaceIntentBinding;
  diagnosticOnly: boolean;
  legacyReplacement?: string;
  routes: readonly OperatorSurfaceRouteDescriptor[];
  defaultAvailability: 'available' | 'planned';
  detail: OperatorSurfaceAvailabilityDetail;
  nextAction?: OperatorSurfaceAction;
}

export interface OperatorSurfaceProjection extends OperatorSurfaceDescriptor {
  availability: OperatorSurfaceAvailability;
  projectedDetail: string;
  projectedRoutes: readonly OperatorSurfaceRouteProjection[];
}

export type OperatorSurfaceAvailabilityOverrides = Partial<
  Record<OperatorSurfaceId, OperatorSurfaceAvailability>
>;

export type OperatorSurfaceRouteAvailabilityOverrides = Partial<
  Record<OperatorSurfaceId, Partial<Record<string, OperatorSurfaceAvailability>>>
>;

export type OperatorSurfaceAdditionalRouteOverrides = Partial<
  Record<OperatorSurfaceId, readonly OperatorSurfaceRouteDescriptor[]>
>;

export interface OperatorSurfaceCatalogProjectionInput {
  workspaceHost?: OperatorSurfaceHostRef;
  authorityHost?: Partial<Record<OperatorSurfaceId, OperatorSurfaceHostRef>>;
  availability?: OperatorSurfaceAvailabilityOverrides;
  routeAvailability?: OperatorSurfaceRouteAvailabilityOverrides;
  additionalRoutes?: OperatorSurfaceAdditionalRouteOverrides;
}

export interface OperatorWorkspaceRouteDirectory {
  schema: typeof OPERATOR_WORKSPACE_ROUTE_DIRECTORY_SCHEMA;
  workspaceHost: OperatorSurfaceHostRef;
  surfaces: readonly OperatorSurfaceProjection[];
}

function authorityForRoute(
  surface: OperatorSurfaceDescriptor,
  route: OperatorSurfaceRouteDescriptor,
): OperatorSurfaceAuthorityRef {
  if (route.target?.kind === 'site' && surface.authority.kind === 'site') {
    return { kind: surface.authority.kind, id: route.target.id };
  }
  if (route.target?.kind === 'session' && (surface.authority.kind === 'nars-session' || surface.authority.kind === 'nars-session-index')) {
    return { kind: 'nars-session', id: route.target.id };
  }
  if (route.target?.kind === 'artifact' && surface.authority.kind === 'artifact') {
    return { kind: surface.authority.kind, id: route.target.id };
  }
  return surface.authority;
}

export function projectOperatorSurfaceRouteBinding(
  surface: OperatorSurfaceDescriptor,
  route: OperatorSurfaceRouteDescriptor,
): Pick<OperatorSurfaceRouteProjection, 'authority' | 'authorityHost' | 'projection' | 'intent' | 'diagnosticOnly' | 'legacyReplacement'> {
  return {
    authority: authorityForRoute(surface, route),
    authorityHost: surface.authorityHost,
    projection: surface.projection,
    intent: surface.intent,
    diagnosticOnly: surface.diagnosticOnly,
    ...(surface.legacyReplacement === undefined ? {} : { legacyReplacement: surface.legacyReplacement }),
  };
}

export const operatorSurfaceDescriptors: readonly OperatorSurfaceDescriptor[] = [
  {
    schema: OPERATOR_SURFACE_DESCRIPTOR_SCHEMA,
    id: 'site-agents',
    name: 'Sites and Agents',
    scope: 'operator-console',
    owner: 'Operator Workspace',
    authority: { kind: 'operator-console', id: '@narada2/cli' },
    authorityHost: { kind: 'local', id: 'operator-console', origin: null },
    projection: { kind: 'site-agent-overview', owner: '@narada2/operator-console-ui' },
    intent: { kind: 'agent-launch', endpoint: OPERATOR_CONSOLE_AGENTS_API_PATH, endpointBase: 'workspace', protocols: ['http'] },
    diagnosticOnly: false,
    routes: [
      { id: 'agents', path: OPERATOR_CONSOLE_AGENTS_PATH, kind: 'page', label: 'Agents', navigationKey: 'agents' },
    ],
    defaultAvailability: 'available',
    detail: {
      available: 'Inspect admitted agents by Site, start stopped agents, and open healthy sessions.',
      unavailable: 'The Sites and Agents projection is not reachable from this host.',
      planned: 'The Sites and Agents projection is not yet available from this host.',
    },
  },
  {
    schema: OPERATOR_SURFACE_DESCRIPTOR_SCHEMA,
    id: 'site-registry',
    name: 'Site Registry',
    scope: 'user-site',
    owner: 'Canonical Site Registry',
    authority: { kind: 'user-site', id: null },
    authorityHost: { kind: 'local', id: 'user-site', origin: null },
    projection: { kind: 'registry', owner: '@narada2/operator-console-ui' },
    intent: { kind: 'registry-workflow', endpoint: OPERATOR_CONSOLE_REGISTRY_PATH, endpointBase: 'workspace', protocols: ['http'] },
    diagnosticOnly: false,
    routes: [
      { id: 'sites', path: OPERATOR_CONSOLE_REGISTRY_PATH, kind: 'page', label: 'Sites', navigationKey: 'sites' },
      { id: 'add', path: `${OPERATOR_CONSOLE_REGISTRY_PATH}/add`, kind: 'workflow', label: 'Add Site', navigationKey: 'add' },
      { id: 'manage', path: `${OPERATOR_CONSOLE_REGISTRY_PATH}/manage`, kind: 'workflow', label: 'Manage', navigationKey: 'manage' },
    ],
    defaultAvailability: 'available',
    detail: {
      available: 'Inspect the canonical inventory and enter governed Site workflows.',
      unavailable: 'The Site Registry projection is not available from this host.',
      planned: 'The Site Registry projection is not yet available from this host.',
    },
  },
  {
    schema: OPERATOR_SURFACE_DESCRIPTOR_SCHEMA,
    id: 'launcher',
    name: 'Site Runtime',
    scope: 'operator-console',
    owner: 'Narada CLI sites',
    authority: { kind: 'operator-console', id: '@narada2/cli' },
    authorityHost: { kind: 'local', id: 'operator-console', origin: null },
    projection: { kind: 'launcher', owner: '@narada2/operator-console-ui' },
    intent: { kind: 'launcher-control', endpoint: '/console/launch', endpointBase: 'workspace', protocols: ['http'] },
    diagnosticOnly: false,
    routes: [
      { id: 'launcher', path: '/console/launch', kind: 'page', label: 'Site Runtime', navigationKey: 'launcher' },
    ],
    defaultAvailability: 'available',
    detail: {
      available: 'Review Site runtime posture and open per-Site launch/ensure actions.',
      unavailable: 'The Site Runtime view is not reachable from this host.',
      planned: 'The Site Runtime route is not yet available from this host.',
    },
  },
  {
    schema: OPERATOR_SURFACE_DESCRIPTOR_SCHEMA,
    id: 'onboarding',
    name: 'First Use',
    scope: 'user-site',
    owner: 'Narada CLI onboarding',
    authority: { kind: 'user-site', id: null },
    authorityHost: { kind: 'local', id: 'operator-console', origin: null },
    projection: { kind: 'workspace', owner: '@narada2/operator-console-ui' },
    intent: { kind: 'onboarding-control', endpoint: OPERATOR_CONSOLE_ONBOARDING_PATH, endpointBase: 'workspace', protocols: ['http'] },
    diagnosticOnly: false,
    routes: [
      { id: 'onboarding', path: OPERATOR_CONSOLE_ONBOARDING_PATH, kind: 'page', label: 'First Use', navigationKey: 'onboarding' },
    ],
    defaultAvailability: 'available',
    detail: {
      available: 'Check the installed User Site and start its resident General assistant.',
      unavailable: 'The first-use onboarding projection is not available from this host.',
      planned: 'The first-use onboarding route is not yet available from this host.',
    },
  },
  {
    schema: OPERATOR_SURFACE_DESCRIPTOR_SCHEMA,
    id: 'site-operations',
    name: 'Site Operations',
    scope: 'local-site',
    owner: 'Task and Agent Operations',
    authority: { kind: 'site', id: null },
    authorityHost: { kind: 'local', id: 'operator-console', origin: null },
    projection: { kind: 'site-operations', owner: '@narada2/cli' },
    intent: { kind: 'site-control', endpoint: '/sites/<site-id>/operations/', endpointBase: 'workspace', protocols: ['http'] },
    diagnosticOnly: false,
    routes: [
      { id: 'operations', path: '/sites/<site-id>/operations/', kind: 'page', label: 'Operations' },
    ],
    defaultAvailability: 'planned',
    detail: {
      available: 'Enter the selected Site\'s task, assignment, review, and agent projections.',
      unavailable: 'Site Operations are not available for the selected Site.',
      planned: 'Select a Site before entering its task, assignment, review, and agent projection.',
    },
    nextAction: { href: '/console/registry', label: 'Select a Site in Site Registry' },
  },
  {
    schema: OPERATOR_SURFACE_DESCRIPTOR_SCHEMA,
    id: 'agent-sessions',
    name: 'Agent Sessions',
    scope: 'nars-session',
    owner: 'Agent Web UI',
    authority: { kind: 'nars-session-index', id: null },
    authorityHost: { kind: 'local', id: 'operator-console', origin: null },
    projection: { kind: 'session-inventory', owner: '@narada2/operator-console-ui' },
    intent: { kind: 'none', endpoint: null, endpointBase: null, protocols: [] },
    diagnosticOnly: false,
    routes: [
      { id: 'sessions', path: '/console/sessions', kind: 'page', label: 'Sessions', navigationKey: 'sessions' },
    ],
    defaultAvailability: 'available',
    detail: {
      available: 'Inspect live and historical NARS sessions from the canonical session index.',
      unavailable: 'The session projection is not reachable from this host.',
      planned: 'Available after the session index projection is registered.',
    },
  },
  {
    schema: OPERATOR_SURFACE_DESCRIPTOR_SCHEMA,
    id: 'artifacts',
    name: 'Artifacts',
    scope: 'nars-session',
    owner: 'Artifact projection',
    authority: { kind: 'artifact', id: null },
    authorityHost: { kind: 'local', id: 'operator-console', origin: null },
    projection: { kind: 'artifact', owner: '@narada2/agent-web-ui' },
    intent: { kind: 'artifact-open', endpoint: '/artifacts/<session-id>/<artifact-id>/', endpointBase: 'workspace', protocols: ['http'] },
    diagnosticOnly: false,
    routes: [
      { id: 'artifact', path: '/artifacts/<session-id>/<artifact-id>/', kind: 'page', label: 'Artifact' },
    ],
    defaultAvailability: 'planned',
    detail: {
      available: 'Inspect session-owned artifacts through their governed projection.',
      unavailable: 'The artifact projection is not reachable from this host.',
      planned: 'Available after session and artifact projections are registered.',
    },
  },
] as const;

function normalizedPath(path: string): string {
  const value = path.trim() || '/';
  const withoutTrailingSlash = value.replace(/\/+$/, '');
  return withoutTrailingSlash || '/';
}

export function projectOperatorSurfaceCatalog(
  input: OperatorSurfaceCatalogProjectionInput = {},
): OperatorSurfaceProjection[] {
  return operatorSurfaceDescriptors.map((descriptor) => {
    const projectedDescriptor = {
      ...descriptor,
      authorityHost: input.authorityHost?.[descriptor.id] ?? descriptor.authorityHost,
    };
    const availability = input.availability?.[descriptor.id] ?? descriptor.defaultAvailability;
    const routes = [...descriptor.routes, ...(input.additionalRoutes?.[descriptor.id] ?? [])];
    const routeIds = new Set<string>();
    const projectedRoutes = routes.map((route) => {
      if (!isOperatorWorkspaceRoutePath(route.path)) {
        throw new Error(`operator_surface_route_path_invalid:${descriptor.id}:${route.id}`);
      }
      if (routeIds.has(route.id)) {
        throw new Error(`operator_surface_route_duplicate:${descriptor.id}:${route.id}`);
      }
      routeIds.add(route.id);
      const routeOverride = input.routeAvailability?.[descriptor.id]?.[route.id];
      const routeAvailability = availability === 'available'
        ? routeOverride ?? 'available'
        : availability;
      return {
        ...route,
        ...projectOperatorSurfaceRouteBinding(projectedDescriptor, route),
        availability: routeAvailability,
        projectedDetail: projectedRouteDetail(routeAvailability),
      } satisfies OperatorSurfaceRouteProjection;
    });
    return {
      ...projectedDescriptor,
      routes,
      availability,
      projectedDetail: descriptor.detail[availability],
      projectedRoutes,
    };
  });
}

export function projectOperatorWorkspaceRouteDirectory(
  input: OperatorSurfaceCatalogProjectionInput = {},
): OperatorWorkspaceRouteDirectory {
  const surfaces = projectOperatorSurfaceCatalog(input);
  const navigationKeys = new Set<string>();
  for (const surface of surfaces) {
    for (const route of surface.projectedRoutes) {
      if (!route.navigationKey) continue;
      if (navigationKeys.has(route.navigationKey)) {
        throw new Error(`operator_workspace_navigation_key_duplicate:${route.navigationKey}`);
      }
      navigationKeys.add(route.navigationKey);
    }
  }
  return {
    schema: OPERATOR_WORKSPACE_ROUTE_DIRECTORY_SCHEMA,
    workspaceHost: input.workspaceHost ?? { kind: 'local', id: 'operator-console', origin: null },
    surfaces,
  };
}

export function primaryOperatorSurfaceRoute(
  descriptor: OperatorSurfaceDescriptor,
): OperatorSurfaceRouteDescriptor | undefined {
  return descriptor.routes[0];
}

export function primaryProjectedOperatorSurfaceRoute(
  projection: OperatorSurfaceProjection,
): OperatorSurfaceRouteProjection | undefined {
  return projection.projectedRoutes[0];
}

export function firstAvailableConcreteProjectedOperatorSurfaceRoute(
  projection: OperatorSurfaceProjection,
): OperatorSurfaceRouteProjection | undefined {
  return projection.projectedRoutes.find((route) =>
    route.availability === 'available' && !route.path.includes('<') && !route.path.includes('>'));
}

export function operatorSurfaceRoutePath(
  surfaceId: OperatorSurfaceId,
  routeId: string,
): string {
  const descriptor = operatorSurfaceDescriptors.find((candidate) => candidate.id === surfaceId);
  const route = descriptor?.routes.find((candidate) => candidate.id === routeId);
  if (!route) {
    throw new Error(`operator_surface_route_not_declared:${surfaceId}:${routeId}`);
  }
  return route.path;
}

export function projectOperatorSurfaceNavigation(
  input: OperatorSurfaceCatalogProjectionInput = {},
): OperatorSurfaceNavigationItem[] {
  return projectOperatorWorkspaceRouteDirectory(input).surfaces.flatMap((surface) => {
    if (surface.availability !== 'available') return [];
    return surface.projectedRoutes.flatMap((route) => {
      if (!route.navigationKey || route.availability !== 'available') return [];
      return [{ key: route.navigationKey, label: route.label, href: route.path }];
    });
  });
}

export function findOperatorSurfaceRoute(
  path: string,
): { surface: OperatorSurfaceDescriptor; route: OperatorSurfaceRouteDescriptor } | undefined {
  const normalized = normalizedPath(path);
  for (const surface of operatorSurfaceDescriptors) {
    const route = surface.routes.find((candidate) => normalizedPath(candidate.path) === normalized);
    if (route) return { surface, route };
  }
  return undefined;
}
