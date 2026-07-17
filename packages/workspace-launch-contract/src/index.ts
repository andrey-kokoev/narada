export type WorkspaceLaunchSelectionCardinality = 'single' | 'multiple';

export interface WorkspaceLaunchSelectionMode {
  site: WorkspaceLaunchSelectionCardinality;
  role: WorkspaceLaunchSelectionCardinality;
  operatorSurface: WorkspaceLaunchSelectionCardinality;
}

export interface WorkspaceLaunchOption {
  value: string;
  label: string;
  hint?: string;
}

export interface WorkspaceLaunchSelection {
  site: string[];
  role: string[];
  operatorSurface: string[];
  runtime: string;
  intelligenceProvider: string;
  selectionMode?: WorkspaceLaunchSelectionMode;
}

export interface WorkspaceLaunchWireRecord {
  site: string;
  role: string;
  agent: string;
  runtime: string;
  operator_surface: string;
  agent_identity_ref?: { canonical_agent_id?: string };
}

export interface WorkspaceLaunchSelectorModel {
  schema: 'narada.workspace_launch.selector_model.v1';
  siteOptions: WorkspaceLaunchOption[];
  roleOptions: WorkspaceLaunchOption[];
  operatorSurfaceOptions: WorkspaceLaunchOption[];
  runtimeOptions: WorkspaceLaunchOption[];
  intelligenceProviderOptions: WorkspaceLaunchOption[];
  selected: WorkspaceLaunchSelection;
}

export interface WorkspaceLaunchWireModel {
  records: WorkspaceLaunchWireRecord[];
  siteChoices: string[];
  initialSites: string[];
  initialRoles: string[];
  initialOperatorSurfaces: string[];
  initialRuntime: string;
  initialIntelligenceProvider: string;
  initialSelectionMode: WorkspaceLaunchSelectionMode;
  narsOperatorSurfaceChoices: string[];
  selectorModel: WorkspaceLaunchSelectorModel;
}

export interface WorkspaceLaunchWireHandoff {
  posture?: string;
  status?: string;
}

export interface WorkspaceLaunchWireObservation {
  health?: string;
  session_id?: string | null;
  last_checked_at?: string;
  ownership_posture?: string;
}

export interface WorkspaceLaunchWireProjection {
  projection_kind?: string;
  status?: string;
}

export const WORKSPACE_LAUNCH_ACTIVE_OBSERVATION_MAX_AGE_MS = 2 * 60 * 1000;

export type WorkspaceLaunchAttemptActivityState = 'active' | 'historical';

export interface WorkspaceLaunchWireAttempt {
  launch_attempt_id: string;
  selection: WorkspaceLaunchSelection;
  status: string;
  result_summary: string;
  activity_state?: WorkspaceLaunchAttemptActivityState;
  expected_launch_session_ids?: string[];
  updated_at?: string;
  created_at?: string;
  started_at?: string;
  handoffs?: WorkspaceLaunchWireHandoff[];
  observations?: WorkspaceLaunchWireObservation[];
  projections?: WorkspaceLaunchWireProjection[];
  actions?: string[];
}

export interface WorkspaceLaunchUiDashboard {
  schema?: string;
  attempts: WorkspaceLaunchWireAttempt[];
}

export interface WorkspaceLaunchBootstrapPayload {
  model: WorkspaceLaunchWireModel;
  persistent: boolean;
  basePath?: string;
}

export type WorkspaceLaunchAction =
  | 'recheck'
  | 'retry'
  | 'forget'
  | 'open-web-ui'
  | 'attach-cli'
  | 'stop-runtime'
  | 'stop-projection';

export interface WorkspaceLaunchUiSession {
  schema: 'narada.workspace_launch.ui_session.v1';
  ui_session_id: string;
  started_at: string;
  status: 'open' | 'closing' | 'closed' | 'timeout' | 'failed';
  lifecycle_schema?: 'narada.workspace_launch.ui_session.lifecycle_state.v1';
  lifecycle_state?: 'created' | 'starting' | 'open' | 'closing' | 'closed' | 'timeout' | 'failed';
  lifecycle_history?: Array<'created' | 'starting' | 'open' | 'closing' | 'closed' | 'timeout' | 'failed'>;
  url: string | null;
  registry_paths: string[];
  owner: {
    package: string;
    command: string;
    surface: string;
  };
}

export interface WorkspaceLaunchUiSessionList {
  schema: 'narada.workspace_launch.ui_session_list.v1';
  sessions: WorkspaceLaunchUiSession[];
  /** Historical records are intentionally separate from attachable sessions. */
  history?: WorkspaceLaunchUiSession[];
}

export interface WorkspaceLaunchResultEnvelope {
  status?: string;
  schema?: string;
  message?: string;
  error?: string;
  reason_code?: string;
  command?: string;
  action?: string;
  launch_count?: number;
  dashboard?: WorkspaceLaunchUiDashboard;
  attempt?: WorkspaceLaunchWireAttempt;
}

export interface WorkspaceLaunchIdentityRef {
  canonical_agent_id?: string;
  local_agent_id?: string;
  role?: string;
  identity_scope?: { kind: string; site_id?: string };
  legacy_agent_id?: string;
}

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
  agent_identity_ref?: WorkspaceLaunchIdentityRef | null;
  control_path?: string | null;
  process_ownership?: Record<string, unknown> | null;
  runtime_pid?: number | null;
  attach_commands?: {
    agent_web_ui?: string | null;
    agent_cli?: string | null;
  };
}

export type WorkspaceLaunchAttemptStatus = 'queued' | 'planning' | 'launching' | 'launched' | 'failed' | 'forgotten';

export type WorkspaceLaunchAttemptLifecycleState =
  | 'queued'
  | 'planning'
  | 'launching'
  | 'handoff_recorded'
  | 'observing'
  | 'launched'
  | 'failed'
  | 'forgotten';

export interface WorkspaceLaunchAttemptRecord {
  schema: 'narada.workspace_launch.attempt.v1';
  launch_attempt_id: string;
  ui_session_id: string;
  expected_launch_session_ids: string[];
  submitted_at: string;
  updated_at: string;
  selection: WorkspaceLaunchSelection;
  status: WorkspaceLaunchAttemptStatus;
  activity_state?: WorkspaceLaunchAttemptActivityState;
  lifecycle_schema?: 'narada.workspace_launch.attempt.lifecycle_state.v1';
  lifecycle_state?: WorkspaceLaunchAttemptLifecycleState;
  lifecycle_history?: WorkspaceLaunchAttemptLifecycleState[];
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
  ui_session: WorkspaceLaunchUiSession;
  attempts: WorkspaceLaunchAttemptRecord[];
  observed_unowned: unknown[];
  actions: string[];
}

type UnknownRecord = Record<string, unknown>;


function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isSelectionMode(value: unknown): value is WorkspaceLaunchSelectionMode {
  if (!isRecord(value)) return false;
  return (value.site === 'single' || value.site === 'multiple')
    && (value.role === 'single' || value.role === 'multiple')
    && (value.operatorSurface === 'single' || value.operatorSurface === 'multiple');
}

function isSelection(value: unknown): value is WorkspaceLaunchSelection {
  if (!isRecord(value)) return false;
  return isStringArray(value.site)
    && isStringArray(value.role)
    && isStringArray(value.operatorSurface)
    && isString(value.runtime)
    && isString(value.intelligenceProvider)
    && (value.selectionMode === undefined || isSelectionMode(value.selectionMode));
}

function isOption(value: unknown): value is WorkspaceLaunchOption {
  if (!isRecord(value)) return false;
  return isString(value.value) && isString(value.label) && isOptionalString(value.hint);
}

function isWireRecord(value: unknown): value is WorkspaceLaunchWireRecord {
  if (!isRecord(value)) return false;
  const identity = value.agent_identity_ref;
  return isString(value.site)
    && isString(value.role)
    && isString(value.agent)
    && isString(value.runtime)
    && isString(value.operator_surface)
    && (identity === undefined || (
      isRecord(identity)
      && isOptionalString(identity.canonical_agent_id)
    ));
}

function isSelectorModel(value: unknown): value is WorkspaceLaunchSelectorModel {
  if (!isRecord(value)) return false;
  return value.schema === 'narada.workspace_launch.selector_model.v1'
    && Array.isArray(value.siteOptions) && value.siteOptions.every(isOption)
    && Array.isArray(value.roleOptions) && value.roleOptions.every(isOption)
    && Array.isArray(value.operatorSurfaceOptions) && value.operatorSurfaceOptions.every(isOption)
    && Array.isArray(value.runtimeOptions) && value.runtimeOptions.every(isOption)
    && Array.isArray(value.intelligenceProviderOptions) && value.intelligenceProviderOptions.every(isOption)
    && isSelection(value.selected);
}

function isWireModel(value: unknown): value is WorkspaceLaunchWireModel {
  if (!isRecord(value)) return false;
  return Array.isArray(value.records) && value.records.every(isWireRecord)
    && isStringArray(value.siteChoices)
    && isStringArray(value.initialSites)
    && isStringArray(value.initialRoles)
    && isStringArray(value.initialOperatorSurfaces)
    && isString(value.initialRuntime)
    && isString(value.initialIntelligenceProvider)
    && isSelectionMode(value.initialSelectionMode)
    && isStringArray(value.narsOperatorSurfaceChoices)
    && isSelectorModel(value.selectorModel);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function isHandoff(value: unknown): value is WorkspaceLaunchWireHandoff {
  if (!isRecord(value)) return false;
  return isOptionalString(value.posture) && isOptionalString(value.status);
}

function isObservation(value: unknown): value is WorkspaceLaunchWireObservation {
  if (!isRecord(value)) return false;
  return isOptionalString(value.health)
    && (value.session_id === undefined || value.session_id === null || isString(value.session_id))
    && isOptionalString(value.last_checked_at)
    && isOptionalString(value.ownership_posture);
}

function isProjection(value: unknown): value is WorkspaceLaunchWireProjection {
  if (!isRecord(value)) return false;
  return isOptionalString(value.projection_kind) && isOptionalString(value.status);
}

function isAttempt(value: unknown): value is WorkspaceLaunchWireAttempt {
  if (!isRecord(value)) return false;
  return isString(value.launch_attempt_id)
    && value.launch_attempt_id.length > 0
    && isSelection(value.selection)
    && isString(value.status)
    && isString(value.result_summary)
    && (value.activity_state === undefined || value.activity_state === 'active' || value.activity_state === 'historical')
    && isOptionalString(value.updated_at)
    && isOptionalString(value.created_at)
    && isOptionalString(value.started_at)
    && (value.handoffs === undefined || (Array.isArray(value.handoffs) && value.handoffs.every(isHandoff)))
    && (value.observations === undefined || (Array.isArray(value.observations) && value.observations.every(isObservation)))
    && (value.projections === undefined || (Array.isArray(value.projections) && value.projections.every(isProjection)))
    && (value.expected_launch_session_ids === undefined || isStringArray(value.expected_launch_session_ids))
    && (value.actions === undefined || isStringArray(value.actions));
}

export function parseWorkspaceLaunchDashboard(value: unknown): WorkspaceLaunchUiDashboard | null {
  if (!isRecord(value) || !Array.isArray(value.attempts) || !value.attempts.every(isAttempt)) return null;
  const dashboard: WorkspaceLaunchUiDashboard = {
    attempts: value.attempts,
  };
  if (isString(value.schema)) dashboard.schema = value.schema;
  return dashboard;
}

function isWorkspaceLaunchUiSession(value: unknown): value is WorkspaceLaunchUiSession {
  if (!isRecord(value)) return false;
  const owner = value.owner;
  return value.schema === 'narada.workspace_launch.ui_session.v1'
    && isString(value.ui_session_id)
    && isString(value.started_at)
    && (value.status === 'open' || value.status === 'closing' || value.status === 'closed' || value.status === 'timeout' || value.status === 'failed')
    && (value.lifecycle_schema === undefined || value.lifecycle_schema === 'narada.workspace_launch.ui_session.lifecycle_state.v1')
    && (value.lifecycle_state === undefined || (isString(value.lifecycle_state) && ['created', 'starting', 'open', 'closing', 'closed', 'timeout', 'failed'].includes(value.lifecycle_state)))
    && (value.lifecycle_history === undefined || (Array.isArray(value.lifecycle_history) && value.lifecycle_history.every((state) => isString(state) && ['created', 'starting', 'open', 'closing', 'closed', 'timeout', 'failed'].includes(state))))
    && (value.url === null || isString(value.url))
    && isStringArray(value.registry_paths)
    && isRecord(owner)
    && isString(owner.package)
    && isString(owner.command)
    && isString(owner.surface);
}

export function parseWorkspaceLaunchUiSessionList(value: unknown): WorkspaceLaunchUiSessionList | null {
  if (!isRecord(value) || value.schema !== 'narada.workspace_launch.ui_session_list.v1') return null;
  if (!Array.isArray(value.sessions) || !value.sessions.every(isWorkspaceLaunchUiSession)) return null;
  if (value.history !== undefined && (!Array.isArray(value.history) || !value.history.every(isWorkspaceLaunchUiSession))) return null;
  return {
    schema: value.schema,
    sessions: value.sessions,
    history: value.history === undefined ? [] : value.history,
  };
}

function optionalNumber(value: unknown): number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value)) ? value as number | undefined : undefined;
}

export function parseWorkspaceLaunchResultEnvelope(value: unknown): WorkspaceLaunchResultEnvelope | null {
  if (!isRecord(value)) return null;
  const dashboard = value.dashboard === undefined ? undefined : parseWorkspaceLaunchDashboard(value.dashboard);
  if (value.dashboard !== undefined && !dashboard) return null;
  let attempt: WorkspaceLaunchWireAttempt | undefined;
  if (value.attempt !== undefined) {
    const parsedAttempt = parseWorkspaceLaunchDashboard({ attempts: [value.attempt] });
    if (!parsedAttempt) return null;
    attempt = parsedAttempt.attempts[0];
  }
  const launchCount = optionalNumber(value.launch_count);
  const hasMeaningfulField = isString(value.status)
    || isString(value.schema)
    || isString(value.message)
    || isString(value.error)
    || isString(value.reason_code)
    || isString(value.command)
    || isString(value.action)
    || launchCount !== undefined
    || dashboard !== undefined
    || attempt !== undefined;
  if (!hasMeaningfulField) return null;
  const envelope: WorkspaceLaunchResultEnvelope = {
    ...(isString(value.status) ? { status: value.status } : {}),
    ...(isString(value.schema) ? { schema: value.schema } : {}),
    ...(isString(value.message) ? { message: value.message } : {}),
    ...(isString(value.error) ? { error: value.error } : {}),
    ...(isString(value.reason_code) ? { reason_code: value.reason_code } : {}),
    ...(isString(value.command) ? { command: value.command } : {}),
    ...(isString(value.action) ? { action: value.action } : {}),
    ...(launchCount !== undefined ? { launch_count: launchCount } : {}),
    ...(dashboard ? { dashboard } : {}),
    ...(attempt ? { attempt } : {}),
  };
  return envelope;
}

export function parseWorkspaceLaunchSelectorModel(value: unknown): WorkspaceLaunchSelectorModel | null {
  return isSelectorModel(value) ? value : null;
}

export function parseWorkspaceLaunchBootstrap(value: unknown): WorkspaceLaunchBootstrapPayload | null {
  if (!isRecord(value) || !isWireModel(value.model) || !isBoolean(value.persistent)) return null;
  return {
    model: value.model,
    persistent: value.persistent,
    ...(isString(value.basePath) ? { basePath: value.basePath } : {}),
  };
}
