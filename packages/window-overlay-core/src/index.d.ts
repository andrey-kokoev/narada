export * from './overlay-surface-fsm.js';

export type OverlayTone = 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'accent';
export type OverlayActionKind = 'open_url' | 'refresh' | 'close' | 'restart';

export interface OverlayRow {
  label: string;
  value: string;
  tone?: OverlayTone;
  tooltip?: string;
  kind?: 'open_url';
  target?: string;
}
export interface OverlayAction {
  id: string;
  label: string;
  kind: OverlayActionKind;
  tone?: OverlayTone;
  target?: string;
  icon?: string;
  tooltip?: string;
}
export interface OverlayDocument {
  schema: typeof OVERLAY_DOCUMENT_SCHEMA;
  id: string;
  title: string;
  title_tone: OverlayTone;
  subtitle: string | null;
  rows: OverlayRow[];
  actions: OverlayAction[];
  updated_at: string;
}
export interface OverlayPaths {
  stateDirectory: string;
  document: string;
  pid: string;
  preferences: string;
  visibilityPolicy: string;
  presencePolicy: string;
  surfacePreferences: string;
  refresh: string;
  focus: string;
  restartCommand: string;
  actionState: string;
  visibilityState: string;
  surfaceSnapshot: string;
  focusOwner: string;
}
export interface OverlayActionState {
  schema: 'narada.window_surface_overlay.action_state.v1';
  action_id: string;
  request_id: string;
  status: 'running' | 'succeeded' | 'failed' | 'interrupted';
  started_at: string;
  finished_at?: string;
  pid?: number;
  exit_code?: number;
  detail?: string;
}
export interface OverlayStatus {
  schema: typeof OVERLAY_RESULT_SCHEMA;
  id: string;
  state: 'running' | 'stopped' | 'started' | 'refresh_requested';
  pid: number | null;
  state_directory: string;
  document_path: string;
  document: OverlayDocument | null;
  action_state: OverlayActionState | null;
  visibility_state: import('./overlay-surface-fsm.js').OverlayRuntimeState | null;
  surface_snapshot: import('./overlay-surface-fsm.js').OverlaySurfaceSnapshot | null;
  focus_owner: Record<string, unknown> | null;
}
export interface OverlayDocumentInput extends Record<string, unknown> {
  id?: unknown;
  title?: unknown;
  title_tone?: unknown;
  subtitle?: unknown;
  rows?: unknown;
  actions?: unknown;
  updated_at?: unknown;
}
export interface OverlayPresencePolicyState {
  schema: 'narada.window_surface_overlay.presence_policy.v1';
  source: 'overlay' | 'surface-default';
  policy: import('./overlay-surface-fsm.js').OverlayVisibilityPolicy | null;
  updated_at: string;
}
interface OverlayPathOptions {
  stateRoot?: string;
  env?: NodeJS.ProcessEnv;
}
interface OverlayLifecycleOptions extends OverlayPathOptions {
  id?: string;
}
interface StartOverlayOptions extends OverlayPathOptions {
  id?: string;
  document?: OverlayDocumentInput | null;
  visibilityPolicy?: import('./overlay-surface-fsm.js').OverlayVisibilityPolicyInput;
  refreshSeconds?: number;
  restartCommand?: readonly string[];
  restartWorkingDirectory?: string;
  restartSuccessProbeUrl?: string;
}
export const OVERLAY_DOCUMENT_SCHEMA: 'narada.window_surface_overlay.document.v1';
export const OVERLAY_RESULT_SCHEMA: 'narada.window_surface_overlay.result.v1';
export function normalizeOverlayEnvironment(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function defaultLocalAppDataRoot(env?: NodeJS.ProcessEnv): string;
export function requestOverlayFocus(id: string, options?: OverlayPathOptions): Promise<Record<string, unknown>>;
export function createOverlayDocument(input?: OverlayDocumentInput): OverlayDocument;
export function publishOverlayDocument(id: string, input: OverlayDocumentInput, options?: OverlayPathOptions): Promise<OverlayDocument>;
export function defaultOverlayStateRoot(env?: NodeJS.ProcessEnv): string;
export function overlayStateDirectory(id: string, options?: OverlayPathOptions): string;
export function overlayPaths(id: string, options?: OverlayPathOptions): OverlayPaths;
export function overlayStatus(id: string, options?: OverlayPathOptions): Promise<OverlayStatus>;
export function requestOverlayRefresh(id: string, options?: OverlayPathOptions): Promise<Record<string, unknown>>;
export function setOverlayPresencePolicy(id: string, selection: import('./overlay-surface-fsm.js').OverlayPresenceSelection, options?: OverlayPathOptions): Promise<OverlayPresencePolicyState>;
export function setOverlaySurfaceDefaultPresencePolicy(policy: import('./overlay-surface-fsm.js').OverlayVisibilityPolicyInput, options?: OverlayPathOptions): Promise<Record<string, unknown>>;
export function overlayHostScriptPath(): string;
export function startOverlay(options?: StartOverlayOptions): Promise<OverlayStatus>;
export function stopOverlay(options?: OverlayLifecycleOptions): Promise<OverlayStatus>;
export function inspectOverlay(options?: OverlayLifecycleOptions): Promise<OverlayStatus>;
export function readOverlayDocument(options?: OverlayLifecycleOptions): Promise<OverlayDocument | null>;
export function removeOverlayState(options?: OverlayLifecycleOptions): Promise<OverlayStatus>;
