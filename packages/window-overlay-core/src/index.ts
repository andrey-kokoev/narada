import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export type OverlayTone = 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'accent';
export type OverlayActionKind = 'open_url' | 'refresh' | 'close' | 'restart';
export type OverlayVisibilityPolicy = 'always' | 'windows-terminal';

export interface OverlayRow {
  label: string;
  value: string;
  tone?: OverlayTone;
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
  refresh: string;
  restartCommand: string;
}

export interface OverlayStatus {
  schema: typeof OVERLAY_RESULT_SCHEMA;
  id: string;
  state: 'running' | 'stopped' | 'started' | 'refresh_requested';
  pid: number | null;
  state_directory: string;
  document_path: string;
  document: OverlayDocument | null;
}

interface OverlayInput extends Record<string, unknown> {
  id?: unknown;
  title?: unknown;
  title_tone?: unknown;
  subtitle?: unknown;
  rows?: unknown;
  actions?: unknown;
  updated_at?: unknown;
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
  document?: OverlayInput | null;
  visibilityPolicy?: OverlayVisibilityPolicy;
  refreshSeconds?: number;
  restartCommand?: readonly string[];
  restartWorkingDirectory?: string;
}

type OverlayRestartCommand = { command: string[]; working_directory?: string };

export const OVERLAY_DOCUMENT_SCHEMA = 'narada.window_surface_overlay.document.v1';
export const OVERLAY_RESULT_SCHEMA = 'narada.window_surface_overlay.result.v1';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
function packageAsset(name: string): string {
  const builtPath = resolve(PACKAGE_ROOT, name);
  return existsSync(builtPath) ? builtPath : resolve(PACKAGE_ROOT, '..', 'src', name);
}

const HOST_SCRIPT = packageAsset('window-surface-overlay.ps1');
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const VALID_ACTIONS = new Set(['open_url', 'refresh', 'close', 'restart']);
const VALID_TONES = new Set(['default', 'muted', 'success', 'warning', 'danger', 'accent']);

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('overlay_value_must_be_object');
  }
  return value as Record<string, unknown>;
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

// PowerShell/WPF can receive SystemRoot without the lowercase windir alias
// when the parent process is an MCP carrier. Normalize that boundary once so
// every Windows overlay host gets the environment WPF expects.
export function normalizeOverlayEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const normalized = { ...env };
  if (process.platform === 'win32' && !normalized.LOCALAPPDATA) {
    normalized.LOCALAPPDATA = defaultLocalAppDataRoot(normalized);
  }
  if (process.platform === 'win32') {
    const extensions = (normalized.PATHEXT ?? '').split(';').map((value) => value.trim().toUpperCase()).filter(Boolean);
    for (const extension of ['.EXE', '.CMD']) {
      if (!extensions.includes(extension)) extensions.push(extension);
    }
    normalized.PATHEXT = extensions.join(';');
  }
  if (process.platform === 'win32' && !normalized.windir) {
    const windowsRoot = normalized.SystemRoot ?? normalized.WINDIR ?? process.env.SystemRoot;
    if (windowsRoot) normalized.windir = windowsRoot;
  }
  return normalized;
}

export function defaultLocalAppDataRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.LOCALAPPDATA?.trim();
  if (configured) return configured;
  const home = env.USERPROFILE?.trim() || env.HOME?.trim() || homedir();
  return join(home, 'AppData', 'Local');
}

function normalizeRestartCommand(command: readonly string[] | undefined, workingDirectory: unknown): OverlayRestartCommand | null {
  if (command === undefined) return null;
  if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== 'string' || !part.trim())) {
    throw new Error('overlay_restart_command_invalid');
  }
  return {
    command: command.map((part) => part),
    ...(workingDirectory ? { working_directory: String(workingDirectory) } : {}),
  };
}

function requireId(value: unknown): string {
  const id = String(value ?? '');
  if (!VALID_ID.test(id)) throw new Error('overlay_id_invalid');
  return id;
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizeRows(rows: unknown): OverlayRow[] {
  if (rows === undefined) return [];
  if (!Array.isArray(rows)) throw new Error('overlay_rows_must_be_array');
  return rows.map((row): OverlayRow => {
    const rowRecord = asRecord(row);
    const label = String(rowRecord.label ?? '').trim();
    if (!label) throw new Error('overlay_row_label_required');
    const tone = rowRecord.tone === undefined ? 'default' : String(rowRecord.tone);
    if (!VALID_TONES.has(tone)) throw new Error('overlay_row_tone_invalid');
    const kind = optionalText(rowRecord.kind);
    const target = optionalText(rowRecord.target);
    if (kind && kind !== 'open_url') throw new Error('overlay_row_kind_invalid');
    if (kind === 'open_url') {
      if (!target) throw new Error('overlay_row_open_url_target_required');
      let url;
      try { url = new URL(target); } catch { throw new Error('overlay_row_open_url_target_invalid'); }
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('overlay_row_open_url_target_scheme_invalid');
      }
    } else if (target) {
      throw new Error('overlay_row_target_requires_kind');
    }
    return {
      label,
      value: optionalText(rowRecord.value) ?? '',
      tone: tone as OverlayTone,
      ...(kind ? { kind: 'open_url' as const, target: target ?? undefined } : {}),
    };
  });
}

function normalizeActions(actions: unknown): OverlayAction[] {
  if (actions === undefined) return [];
  if (!Array.isArray(actions)) throw new Error('overlay_actions_must_be_array');
  return actions.map((action): OverlayAction => {
    const actionRecord = asRecord(action);
    const id = String(actionRecord.id ?? '').trim();
    const label = String(actionRecord.label ?? '').trim();
    const kind = String(actionRecord.kind ?? '') as OverlayActionKind;
    if (!id || !label) throw new Error('overlay_action_identity_required');
    if (!VALID_ACTIONS.has(kind)) throw new Error('overlay_action_kind_invalid');
    const tone = actionRecord.tone === undefined ? 'default' : String(actionRecord.tone);
    if (!VALID_TONES.has(tone)) throw new Error('overlay_action_tone_invalid');
    const target = optionalText(actionRecord.target);
    if (kind === 'restart' && target) throw new Error('overlay_restart_target_forbidden');
    if (kind === 'open_url') {
      if (!target) throw new Error('overlay_open_url_target_required');
      let url;
      try { url = new URL(target); } catch { throw new Error('overlay_open_url_target_invalid'); }
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('overlay_open_url_target_scheme_invalid');
      }
    }
    const icon = optionalText(actionRecord.icon);
    const tooltip = optionalText(actionRecord.tooltip);
    return {
      id,
      label,
      kind,
      tone: tone as OverlayTone,
      ...(target ? { target } : {}),
      ...(icon ? { icon } : {}),
      ...(tooltip ? { tooltip } : {}),
    };
  });
}

export function createOverlayDocument(input: OverlayInput = {}): OverlayDocument {
  const id = requireId(input.id ?? 'narada-overlay');
  const titleTone = input.title_tone === undefined ? 'default' : String(input.title_tone);
  if (!VALID_TONES.has(titleTone)) throw new Error('overlay_title_tone_invalid');
  return {
    schema: OVERLAY_DOCUMENT_SCHEMA,
    id,
    title: String(input.title ?? id),
    title_tone: titleTone as OverlayTone,
    subtitle: optionalText(input.subtitle),
    rows: normalizeRows(input.rows),
    actions: normalizeActions(input.actions),
    updated_at: String(input.updated_at ?? new Date().toISOString()),
  };
}

export function defaultOverlayStateRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.NARADA_WINDOW_SURFACE_OVERLAY_STATE_ROOT
    || join(defaultLocalAppDataRoot(env), 'Narada', 'window-surface-overlays');
}

export function overlayStateDirectory(id: string, options: OverlayPathOptions = {}): string {
  return join(options.stateRoot || defaultOverlayStateRoot(options.env), requireId(id));
}

export function overlayPaths(id: string, options: OverlayPathOptions = {}): OverlayPaths {
  const stateDirectory = overlayStateDirectory(id, options);
  return {
    stateDirectory,
    document: join(stateDirectory, 'document.json'),
    pid: join(stateDirectory, 'overlay.pid'),
    preferences: join(stateDirectory, 'preferences.json'),
    refresh: join(stateDirectory, 'refresh.signal'),
    restartCommand: join(stateDirectory, 'restart.command.json'),
  };
}

async function ensureStateDirectory(id: string, options: OverlayPathOptions = {}): Promise<OverlayPaths> {
  const paths = overlayPaths(id, options);
  await mkdir(paths.stateDirectory, { recursive: true });
  return paths;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error: unknown) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function overlayStatus(id: string, options: OverlayPathOptions = {}): Promise<OverlayStatus> {
  const normalizedId = requireId(id);
  const paths = overlayPaths(normalizedId, options);
  let pid: number | null = null;
  try {
    pid = Number.parseInt((await readFile(paths.pid, 'utf8')).trim(), 10);
  } catch (error: unknown) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  let running = false;
  if (pid !== null && Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      running = true;
    } catch (error: unknown) {
      if (!['ESRCH', 'EPERM'].includes(errorCode(error) ?? '')) throw error;
    }
  }
  const storedDocument = await readJson(paths.document);
  return {
    schema: OVERLAY_RESULT_SCHEMA,
    id: normalizedId,
    state: running ? 'running' : 'stopped',
    pid: running ? pid : null,
    state_directory: paths.stateDirectory,
    document_path: paths.document,
    document: storedDocument ? createOverlayDocument(asRecord(storedDocument)) : null,
  };
}

export async function requestOverlayRefresh(id: string, options: OverlayPathOptions = {}): Promise<Record<string, unknown>> {
  const normalizedId = requireId(id);
  const paths = await ensureStateDirectory(normalizedId, options);
  await writeFile(paths.refresh, new Date().toISOString() + '\n', 'utf8');
  return {
    schema: OVERLAY_RESULT_SCHEMA,
    id: normalizedId,
    state: 'refresh_requested',
    state_directory: paths.stateDirectory,
  };
}

function runPowerShell(script: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const normalizedEnv = normalizeOverlayEnvironment(env);
    const child = spawn(normalizedEnv.NARADA_POWERSHELL || 'pwsh', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script, ...args,
    ], { windowsHide: true, env: normalizedEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error('overlay_powershell_failed:' + code + ':' + (stderr.trim() || stdout.trim())));
    });
  });
}

export function overlayHostScriptPath(): string {
  return HOST_SCRIPT;
}

export async function startOverlay({
  id,
  document,
  stateRoot,
  visibilityPolicy = 'windows-terminal',
  refreshSeconds = 2,
  restartCommand,
  restartWorkingDirectory,
  env = process.env,
}: StartOverlayOptions = {}): Promise<OverlayStatus> {
  const normalized = createOverlayDocument({ ...(document ?? {}), id: id ?? document?.id });
  const paths = await ensureStateDirectory(normalized.id, { stateRoot, env });
  await writeJson(paths.document, normalized);
  const normalizedRestartCommand = normalizeRestartCommand(restartCommand, restartWorkingDirectory);
  if (normalizedRestartCommand) await writeJson(paths.restartCommand, normalizedRestartCommand);
  else {
    try { await unlink(paths.restartCommand); } catch (error: unknown) { if (errorCode(error) !== 'ENOENT') throw error; }
  }
  await runPowerShell(packageAsset('Start-WindowSurfaceOverlay.ps1'), [
    '-Id', normalized.id,
    '-StateRoot', paths.stateDirectory,
    '-VisibilityPolicy', visibilityPolicy,
    '-RefreshSeconds', String(refreshSeconds),
  ], env);
  return { ...(await overlayStatus(normalized.id, { stateRoot, env })), state: 'started' };
}

export async function stopOverlay({ id, stateRoot, env = process.env }: OverlayLifecycleOptions = {}): Promise<OverlayStatus> {
  const normalizedId = requireId(id);
  const paths = overlayPaths(normalizedId, { stateRoot, env });
  await runPowerShell(packageAsset('Stop-WindowSurfaceOverlay.ps1'), [
    '-Id', normalizedId, '-StateRoot', paths.stateDirectory,
  ], env);
  return overlayStatus(normalizedId, { stateRoot, env });
}

export async function inspectOverlay({ id, stateRoot, env = process.env }: OverlayLifecycleOptions = {}): Promise<OverlayStatus> {
  return overlayStatus(requireId(id), { stateRoot, env });
}

export async function readOverlayDocument({ id, stateRoot, env = process.env }: OverlayLifecycleOptions = {}): Promise<OverlayDocument | null> {
  const document = await readJson(overlayPaths(requireId(id), { stateRoot, env }).document);
  return document ? createOverlayDocument(asRecord(document)) : null;
}

export async function removeOverlayState({ id, stateRoot, env = process.env }: OverlayLifecycleOptions = {}): Promise<OverlayStatus> {
  const normalizedId = requireId(id);
  const paths = overlayPaths(normalizedId, { stateRoot, env });
  for (const path of [paths.pid, paths.refresh, paths.restartCommand, paths.document]) {
    try { await unlink(path); } catch (error: unknown) { if (errorCode(error) !== 'ENOENT') throw error; }
  }
  return overlayStatus(normalizedId, { stateRoot, env });
}