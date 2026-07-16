import {
  parseWorkspaceLaunchBootstrap,
  parseWorkspaceLaunchDashboard,
  parseWorkspaceLaunchSelectorModel,
  WORKSPACE_LAUNCH_ACTIVE_OBSERVATION_MAX_AGE_MS,
} from '@narada2/workspace-launch-contract';
import type {
  WorkspaceLaunchAttemptActivityState,
  WorkspaceLaunchOption,
  WorkspaceLaunchSelection,
  WorkspaceLaunchSelectionMode,
  WorkspaceLaunchSelectorModel,
  WorkspaceLaunchWireAttempt,
  WorkspaceLaunchWireHandoff,
  WorkspaceLaunchWireModel,
  WorkspaceLaunchWireObservation,
  WorkspaceLaunchWireProjection,
  WorkspaceLaunchWireRecord,
} from '@narada2/workspace-launch-contract';

export type LaunchOption = WorkspaceLaunchOption;
export type LaunchSelection = WorkspaceLaunchSelection;
export type SelectionMode = WorkspaceLaunchSelectionMode;

export interface LaunchRecord {
  site: string;
  role: string;
  agent: string;
  runtime: string;
  operatorSurface: string;
  agentIdentityRef?: { canonicalAgentId: string };
}

export const ACTIVE_LAUNCH_OBSERVATION_MAX_AGE_MS = WORKSPACE_LAUNCH_ACTIVE_OBSERVATION_MAX_AGE_MS;

export function isWorkspaceLaunchAttemptActive(attempt: LaunchAttempt, now = Date.now()): boolean {
  if (attempt.activityState !== undefined) return attempt.activityState === 'active';
  if (attempt.status !== 'launched' || attempt.expectedLaunchSessionIds.length === 0) return false;
  const observation = [...attempt.observations]
    .filter((candidate) => candidate.health || candidate.sessionId || candidate.lastCheckedAt)
    .sort((left, right) => {
      const leftCheckedAt = Date.parse(left.lastCheckedAt || '');
      const rightCheckedAt = Date.parse(right.lastCheckedAt || '');
      return (Number.isFinite(leftCheckedAt) ? leftCheckedAt : Number.NEGATIVE_INFINITY)
        - (Number.isFinite(rightCheckedAt) ? rightCheckedAt : Number.NEGATIVE_INFINITY);
    })
    .at(-1);
  if (!observation || observation.health !== 'healthy' || !observation.sessionId) return false;
  if (!attempt.expectedLaunchSessionIds.includes(observation.sessionId)) return false;
  if (observation.ownershipPosture !== 'owned_by_runtime_authority') return false;
  const lastCheckedAt = Date.parse(observation.lastCheckedAt || '');
  if (!Number.isFinite(lastCheckedAt)) return false;
  const age = now - lastCheckedAt;
  return age >= 0 && age <= ACTIVE_LAUNCH_OBSERVATION_MAX_AGE_MS;
}

export function workspaceLaunchAttemptsForView(attempts: LaunchAttempt[], showHistory: boolean, now = Date.now()): LaunchAttempt[] {
  return attempts.filter((attempt) => showHistory
    ? !isWorkspaceLaunchAttemptActive(attempt, now)
    : isWorkspaceLaunchAttemptActive(attempt, now));
}

export interface SelectorModel {
  selected: {
    runtime?: string;
    intelligenceProvider?: string;
  };
  operatorSurfaceOptions: LaunchOption[];
  runtimeOptions: LaunchOption[];
  intelligenceProviderOptions: LaunchOption[];
}

export interface LauncherModel {
  records: LaunchRecord[];
  siteChoices: string[];
  initialSites: string[];
  initialRoles: string[];
  initialOperatorSurfaces: string[];
  initialRuntime: string;
  initialIntelligenceProvider: string;
  initialSelectionMode: SelectionMode;
  narsOperatorSurfaceChoices: string[];
  selectorModel: SelectorModel;
}

export interface Bootstrap {
  model: LauncherModel;
  persistent: boolean;
  basePath: string;
}

export interface Handoff {
  posture?: string;
  status?: string;
}

export interface RuntimeObservation {
  health?: string;
  sessionId?: string | null;
  lastCheckedAt?: string | null;
  ownershipPosture?: string | null;
}

export interface ProjectionObservation {
  projectionKind?: string;
  status?: string;
}

export interface LaunchAttempt {
  launchAttemptId: string;
  selection: LaunchSelection;
  status: string;
  resultSummary: string;
  updatedAt: string | null;
  activityState?: WorkspaceLaunchAttemptActivityState;
  expectedLaunchSessionIds: string[];
  handoffs: Handoff[];
  observations: RuntimeObservation[];
  projections: ProjectionObservation[];
  actions: string[];
  raw: unknown;
}

export interface StageRow {
  name: string;
  value: string;
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseOption(value: WorkspaceLaunchOption): LaunchOption {
  return {
    value: value.value,
    label: value.label,
    hint: value.hint,
  };
}

function parseRecord(value: WorkspaceLaunchWireRecord): LaunchRecord {
  return {
    site: value.site,
    role: value.role,
    agent: value.agent,
    runtime: value.runtime,
    operatorSurface: value.operator_surface,
    agentIdentityRef: value.agent_identity_ref?.canonical_agent_id
      ? { canonicalAgentId: value.agent_identity_ref.canonical_agent_id }
      : undefined,
  };
}

export function parseWorkspaceLaunchSelectorModelPayload(
  value: WorkspaceLaunchSelectorModel,
): SelectorModel {
  return {
    selected: {
      runtime: value.selected.runtime || undefined,
      intelligenceProvider: value.selected.intelligenceProvider || undefined,
    },
    operatorSurfaceOptions: value.operatorSurfaceOptions.map(parseOption),
    runtimeOptions: value.runtimeOptions.map(parseOption),
    intelligenceProviderOptions: value.intelligenceProviderOptions.map(parseOption),
  };
}

function parseModel(value: WorkspaceLaunchWireModel): LauncherModel {
  return {
    records: value.records.map(parseRecord),
    siteChoices: value.siteChoices,
    initialSites: value.initialSites,
    initialRoles: value.initialRoles,
    initialOperatorSurfaces: value.initialOperatorSurfaces,
    initialRuntime: value.initialRuntime,
    initialIntelligenceProvider: value.initialIntelligenceProvider,
    initialSelectionMode: value.initialSelectionMode,
    narsOperatorSurfaceChoices: value.narsOperatorSurfaceChoices,
    selectorModel: parseWorkspaceLaunchSelectorModelPayload(value.selectorModel),
  };
}

export function parseWorkspaceLaunchBootstrapPayload(value: unknown): Bootstrap | null {
  const parsed = parseWorkspaceLaunchBootstrap(value);
  if (!parsed) return null;
  return {
    model: parseModel(parsed.model),
    persistent: parsed.persistent,
    basePath: parsed.basePath || '',
  };
}

function parseHandoff(value: WorkspaceLaunchWireHandoff): Handoff {
  return { posture: value.posture, status: value.status };
}

function parseObservation(value: WorkspaceLaunchWireObservation): RuntimeObservation {
  return {
    health: value.health,
    sessionId: value.session_id,
    ...(value.last_checked_at ? { lastCheckedAt: value.last_checked_at } : {}),
    ...(value.ownership_posture ? { ownershipPosture: value.ownership_posture } : {}),
  };
}

function parseProjection(value: WorkspaceLaunchWireProjection): ProjectionObservation {
  return {
    projectionKind: value.projection_kind,
    status: value.status,
  };
}

function parseAttempt(value: WorkspaceLaunchWireAttempt): LaunchAttempt {
  return {
    launchAttemptId: value.launch_attempt_id,
    selection: value.selection,
    status: value.status,
    resultSummary: value.result_summary,
    updatedAt: value.updated_at || value.created_at || value.started_at || null,
    ...(value.activity_state ? { activityState: value.activity_state } : {}),
    expectedLaunchSessionIds: value.expected_launch_session_ids ?? [],
    handoffs: value.handoffs?.map(parseHandoff) ?? [],
    observations: value.observations?.map(parseObservation) ?? [],
    projections: value.projections?.map(parseProjection) ?? [],
    actions: value.actions ?? [],
    raw: value,
  };
}

export function parseWorkspaceLaunchDashboardAttempts(value: unknown): LaunchAttempt[] | null {
  const parsed = parseWorkspaceLaunchDashboard(value);
  return parsed ? parsed.attempts.map(parseAttempt) : null;
}

export function objectRecord(value: unknown): Record<string, unknown> {
  return objectValue(value);
}

export function arrayValues(value: unknown): unknown[] {
  return arrayValue(value);
}
