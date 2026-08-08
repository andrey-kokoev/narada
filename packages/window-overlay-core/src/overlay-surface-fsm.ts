export type OverlayVisibilityPolicy = 'always' | 'terminal-group' | 'hidden';
export type OverlayVisibilityPolicyInput = OverlayVisibilityPolicy | 'windows-terminal';
export type OverlayPresenceSelection = OverlayVisibilityPolicy | 'surface-default';
export type OverlayLifecycleState = 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
export type OverlayVisibilityState = 'unknown' | 'showing' | 'visible' | 'hiding' | 'hidden' | 'fault';
export type OverlayZOrderState = 'normal' | 'topmost';
export type OverlayFocusState = 'inactive' | 'requested' | 'focused' | 'failed';
export type OverlayForegroundKind = 'terminal' | 'overlay' | 'external' | 'unknown';
export type OverlayVisibilityReason = OverlayVisibilityDecision['reason'] | 'not_projected' | 'visibility_fault';

export const OVERLAY_SURFACE_SNAPSHOT_SCHEMA = 'narada.window_surface_overlay.surface_snapshot.v1';
export const OVERLAY_RUNTIME_STATE_SCHEMA = 'narada.window_surface_overlay.runtime_state.v1';
export const OVERLAY_SURFACE_PREFERENCES_SCHEMA = 'narada.window_surface_overlay.surface_preferences.v1';
export const OVERLAY_PRESENCE_POLICY_SCHEMA = 'narada.window_surface_overlay.presence_policy.v1';

export interface OverlayVisibilityDecision {
  desired_visibility: 'visible' | 'hidden';
  reason: 'policy_always' | 'policy_hidden' | 'terminal_group_active' | 'foreground_external' | 'foreground_unknown';
}

export interface OverlaySurfaceMember {
  id: string;
  pid: number | null;
  policy: OverlayVisibilityPolicy;
  lifecycle: OverlayLifecycleState;
  visibility: OverlayVisibilityState;
  z_order: OverlayZOrderState;
  focus: OverlayFocusState;
  decision: OverlayVisibilityDecision;
}

export interface OverlaySurfaceSnapshot {
  schema: typeof OVERLAY_SURFACE_SNAPSHOT_SCHEMA;
  surface_id: 'narada-desktop-overlay-surface';
  revision: number;
  topology_key: string;
  foreground: {
    kind: OverlayForegroundKind;
    pid: number | null;
    overlay_id: string | null;
    title: string;
  };
  focus_owner: {
    schema: 'narada.window_surface_overlay.focus_owner.v1';
    surface_id: 'narada-desktop-overlay-surface';
    id: string;
    pid: number;
    updated_at: string;
  } | null;
  members: OverlaySurfaceMember[];
  updated_at: string;
}

export interface OverlayRuntimeState {
  schema: typeof OVERLAY_RUNTIME_STATE_SCHEMA;
  id: string;
  pid: number | null;
  policy: OverlayVisibilityPolicy;
  lifecycle: OverlayLifecycleState;
  visibility: OverlayVisibilityState;
  desired_visibility: 'visible' | 'hidden' | 'unknown';
  visibility_reason: OverlayVisibilityReason;
  z_order: OverlayZOrderState;
  focus: OverlayFocusState;
  surface_revision: number | null;
  updated_at: string;
  detail?: string;
}

export type OverlayRuntimeEvent =
  | { type: 'started' }
  | { type: 'stopping' }
  | { type: 'stopped' }
  | { type: 'failed'; detail?: string }
  | { type: 'visibility_desired'; decision: OverlayVisibilityDecision }
  | { type: 'visibility_applied'; visible: boolean }
  | { type: 'focus_requested' }
  | { type: 'focus_resolved'; focused: boolean };

export function normalizeOverlayVisibilityPolicy(value: unknown = 'terminal-group'): OverlayVisibilityPolicy {
  const policy = String(value ?? '').trim().toLowerCase();
  if (policy === 'windows-terminal') return 'terminal-group';
  if (policy === 'always' || policy === 'terminal-group' || policy === 'hidden') return policy;
  throw new Error('overlay_visibility_policy_invalid');
}

export function deriveOverlayVisibilityDecision(
  policyInput: OverlayVisibilityPolicyInput,
  foregroundKind: OverlayForegroundKind,
): OverlayVisibilityDecision {
  const policy = normalizeOverlayVisibilityPolicy(policyInput);
  if (policy === 'always') return { desired_visibility: 'visible', reason: 'policy_always' };
  if (policy === 'hidden') return { desired_visibility: 'hidden', reason: 'policy_hidden' };
  if (foregroundKind === 'terminal' || foregroundKind === 'overlay') {
    return { desired_visibility: 'visible', reason: 'terminal_group_active' };
  }
  return {
    desired_visibility: 'hidden',
    reason: foregroundKind === 'unknown' ? 'foreground_unknown' : 'foreground_external',
  };
}

export function createOverlayRuntimeState(
  id: string,
  policyInput: OverlayVisibilityPolicyInput = 'terminal-group',
  pid: number | null = null,
  zOrder: OverlayZOrderState = 'topmost',
): OverlayRuntimeState {
  return {
    schema: OVERLAY_RUNTIME_STATE_SCHEMA,
    id,
    pid,
    policy: normalizeOverlayVisibilityPolicy(policyInput),
    lifecycle: 'starting',
    visibility: 'unknown',
    desired_visibility: 'unknown',
    visibility_reason: 'not_projected',
    z_order: zOrder,
    focus: 'inactive',
    surface_revision: null,
    updated_at: new Date().toISOString(),
  };
}

export function reduceOverlayRuntimeState(
  current: OverlayRuntimeState,
  event: OverlayRuntimeEvent,
): OverlayRuntimeState {
  const next = { ...current, updated_at: new Date().toISOString() };
  const requireLifecycle = (...allowed: OverlayLifecycleState[]) => {
    if (!allowed.includes(current.lifecycle)) {
      throw new Error(`overlay_lifecycle_transition_invalid:${current.lifecycle}:${event.type}`);
    }
  };
  const requireVisibility = (...allowed: OverlayVisibilityState[]) => {
    if (!allowed.includes(current.visibility)) {
      throw new Error(`overlay_visibility_transition_invalid:${current.visibility}:${event.type}`);
    }
  };
  const requireFocus = (...allowed: OverlayFocusState[]) => {
    if (!allowed.includes(current.focus)) {
      throw new Error(`overlay_focus_transition_invalid:${current.focus}:${event.type}`);
    }
  };
  switch (event.type) {
    case 'started':
      requireLifecycle('starting');
      return { ...next, lifecycle: 'running', visibility: 'unknown', detail: undefined };
    case 'stopping':
      requireLifecycle('starting', 'running');
      return { ...next, lifecycle: 'stopping' };
    case 'stopped':
      requireLifecycle('stopping');
      return { ...next, lifecycle: 'stopped', visibility: 'hidden', desired_visibility: 'hidden', focus: 'inactive' };
    case 'failed':
      requireLifecycle('starting', 'running', 'stopping');
      return { ...next, lifecycle: 'failed', visibility: 'fault', detail: event.detail };
    case 'visibility_desired':
      requireLifecycle('running');
      return {
        ...next,
        desired_visibility: event.decision.desired_visibility,
        visibility_reason: event.decision.reason,
        visibility: event.decision.desired_visibility === 'visible' ? 'showing' : 'hiding',
      };
    case 'visibility_applied':
      requireLifecycle('running');
      requireVisibility(event.visible ? 'showing' : 'hiding');
      return { ...next, visibility: event.visible ? 'visible' : 'hidden' };
    case 'focus_requested':
      requireLifecycle('running');
      requireFocus('inactive', 'focused', 'failed');
      return { ...next, focus: 'requested' };
    case 'focus_resolved':
      requireLifecycle('running');
      requireFocus('requested');
      return { ...next, focus: event.focused ? 'focused' : 'failed' };
  }
}
