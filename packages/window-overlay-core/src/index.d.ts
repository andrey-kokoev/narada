export type OverlayTone = 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'accent';
export type OverlayActionKind = 'open_url' | 'refresh' | 'close' | 'restart';
export type OverlayVisibilityPolicy = 'always' | 'windows-terminal';

export interface OverlayRow { label: string; value: string; tone?: OverlayTone; kind?: 'open_url'; target?: string; }
export interface OverlayAction { id: string; label: string; kind: OverlayActionKind; tone?: OverlayTone; target?: string; icon?: string; tooltip?: string; }
export interface OverlayDocument {
  schema: 'narada.window_surface_overlay.document.v1';
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
  refresh: string;
  restartCommand: string;
}
export interface OverlayStatus {
  schema: 'narada.window_surface_overlay.result.v1';
  id: string;
  state: 'running' | 'stopped';
  pid: number | null;
  state_directory: string;
  document_path: string;
  document: OverlayDocument | null;
}
export function createOverlayDocument(input?: Partial<Omit<OverlayDocument, 'schema' | 'updated_at'>> & { updated_at?: string }): OverlayDocument;
export function defaultOverlayStateRoot(env?: NodeJS.ProcessEnv): string;
export function overlayStateDirectory(id: string, options?: { stateRoot?: string; env?: NodeJS.ProcessEnv }): string;
export function overlayPaths(id: string, options?: { stateRoot?: string; env?: NodeJS.ProcessEnv }): OverlayPaths;
export function overlayStatus(id: string, options?: { stateRoot?: string; env?: NodeJS.ProcessEnv }): Promise<OverlayStatus>;
export function requestOverlayRefresh(id: string, options?: { stateRoot?: string; env?: NodeJS.ProcessEnv }): Promise<Record<string, unknown>>;
export function overlayHostScriptPath(): string;
export function startOverlay(options: { id?: string; document: Partial<OverlayDocument>; stateRoot?: string; visibilityPolicy?: OverlayVisibilityPolicy; refreshSeconds?: number; restartCommand?: readonly string[]; restartWorkingDirectory?: string; env?: NodeJS.ProcessEnv }): Promise<OverlayStatus>;
export function stopOverlay(options: { id: string; stateRoot?: string; env?: NodeJS.ProcessEnv }): Promise<OverlayStatus>;
export function inspectOverlay(options: { id: string; stateRoot?: string; env?: NodeJS.ProcessEnv }): Promise<OverlayStatus>;
export function readOverlayDocument(options: { id: string; stateRoot?: string; env?: NodeJS.ProcessEnv }): Promise<OverlayDocument | null>;
export function removeOverlayState(options: { id: string; stateRoot?: string; env?: NodeJS.ProcessEnv }): Promise<OverlayStatus>;