import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const OVERLAY_DOCUMENT_SCHEMA = 'narada.window_surface_overlay.document.v1';
export const OVERLAY_RESULT_SCHEMA = 'narada.window_surface_overlay.result.v1';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const HOST_SCRIPT = resolve(PACKAGE_ROOT, 'window-surface-overlay.ps1');
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const VALID_ACTIONS = new Set(['open_url', 'refresh', 'close', 'restart']);
const VALID_TONES = new Set(['default', 'muted', 'success', 'warning', 'danger', 'accent']);

// PowerShell/WPF can receive SystemRoot without the lowercase windir alias
// when the parent process is an MCP carrier. Normalize that boundary once so
// every Windows overlay host gets the environment WPF expects.
export function normalizeOverlayEnvironment(env = process.env) {
  const normalized = { ...env };
  if (process.platform === 'win32' && !normalized.windir) {
    const windowsRoot = normalized.SystemRoot ?? normalized.WINDIR ?? process.env.SystemRoot;
    if (windowsRoot) normalized.windir = windowsRoot;
  }
  return normalized;
}

function normalizeRestartCommand(command, workingDirectory) {
  if (command === undefined) return null;
  if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== 'string' || !part.trim())) {
    throw new Error('overlay_restart_command_invalid');
  }
  return {
    command: command.map((part) => part),
    ...(workingDirectory ? { working_directory: String(workingDirectory) } : {}),
  };
}

function requireId(value) {
  const id = String(value ?? '');
  if (!VALID_ID.test(id)) throw new Error('overlay_id_invalid');
  return id;
}

function optionalText(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizeRows(rows) {
  if (rows === undefined) return [];
  if (!Array.isArray(rows)) throw new Error('overlay_rows_must_be_array');
  return rows.map((row) => {
    if (!row || typeof row !== 'object') throw new Error('overlay_row_must_be_object');
    const label = String(row.label ?? '').trim();
    if (!label) throw new Error('overlay_row_label_required');
    const tone = row.tone === undefined ? 'default' : String(row.tone);
    if (!VALID_TONES.has(tone)) throw new Error('overlay_row_tone_invalid');
    const kind = optionalText(row.kind);
    const target = optionalText(row.target);
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
      value: optionalText(row.value) ?? '',
      tone,
      ...(kind ? { kind, target } : {}),
    };
  });
}

function normalizeActions(actions) {
  if (actions === undefined) return [];
  if (!Array.isArray(actions)) throw new Error('overlay_actions_must_be_array');
  return actions.map((action) => {
    if (!action || typeof action !== 'object') throw new Error('overlay_action_must_be_object');
    const id = String(action.id ?? '').trim();
    const label = String(action.label ?? '').trim();
    const kind = String(action.kind ?? '');
    if (!id || !label) throw new Error('overlay_action_identity_required');
    if (!VALID_ACTIONS.has(kind)) throw new Error('overlay_action_kind_invalid');
    const tone = action.tone === undefined ? 'default' : String(action.tone);
    if (!VALID_TONES.has(tone)) throw new Error('overlay_action_tone_invalid');
    const target = optionalText(action.target);
    if (kind === 'restart' && target) throw new Error('overlay_restart_target_forbidden');
    if (kind === 'open_url') {
      if (!target) throw new Error('overlay_open_url_target_required');
      let url;
      try { url = new URL(target); } catch { throw new Error('overlay_open_url_target_invalid'); }
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('overlay_open_url_target_scheme_invalid');
      }
    }
    const icon = optionalText(action.icon);
    const tooltip = optionalText(action.tooltip);
    return {
      id,
      label,
      kind,
      tone,
      ...(target ? { target } : {}),
      ...(icon ? { icon } : {}),
      ...(tooltip ? { tooltip } : {}),
    };
  });
}

export function createOverlayDocument(input = {}) {
  const id = requireId(input.id ?? 'narada-overlay');
  const titleTone = input.title_tone === undefined ? 'default' : String(input.title_tone);
  if (!VALID_TONES.has(titleTone)) throw new Error('overlay_title_tone_invalid');
  return {
    schema: OVERLAY_DOCUMENT_SCHEMA,
    id,
    title: String(input.title ?? id),
    title_tone: titleTone,
    subtitle: optionalText(input.subtitle),
    rows: normalizeRows(input.rows),
    actions: normalizeActions(input.actions),
    updated_at: String(input.updated_at ?? new Date().toISOString()),
  };
}

export function defaultOverlayStateRoot(env = process.env) {
  return env.NARADA_WINDOW_SURFACE_OVERLAY_STATE_ROOT
    || join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Narada', 'window-surface-overlays');
}

export function overlayStateDirectory(id, options = {}) {
  return join(options.stateRoot || defaultOverlayStateRoot(options.env), requireId(id));
}

export function overlayPaths(id, options = {}) {
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

async function ensureStateDirectory(id, options = {}) {
  const paths = overlayPaths(id, options);
  await mkdir(paths.stateDirectory, { recursive: true });
  return paths;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function overlayStatus(id, options = {}) {
  const normalizedId = requireId(id);
  const paths = overlayPaths(normalizedId, options);
  let pid = null;
  try {
    pid = Number.parseInt((await readFile(paths.pid, 'utf8')).trim(), 10);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  let running = false;
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      running = true;
    } catch (error) {
      if (!['ESRCH', 'EPERM'].includes(error?.code)) throw error;
    }
  }
  return {
    schema: OVERLAY_RESULT_SCHEMA,
    id: normalizedId,
    state: running ? 'running' : 'stopped',
    pid: running ? pid : null,
    state_directory: paths.stateDirectory,
    document_path: paths.document,
    document: await readJson(paths.document),
  };
}

export async function requestOverlayRefresh(id, options = {}) {
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

function runPowerShell(script, args, env = process.env) {
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

export function overlayHostScriptPath() {
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
} = {}) {
  const normalized = createOverlayDocument({ ...(document || {}), id: id ?? document?.id });
  const paths = await ensureStateDirectory(normalized.id, { stateRoot, env });
  await writeJson(paths.document, normalized);
  const normalizedRestartCommand = normalizeRestartCommand(restartCommand, restartWorkingDirectory);
  if (normalizedRestartCommand) await writeJson(paths.restartCommand, normalizedRestartCommand);
  else {
    try { await unlink(paths.restartCommand); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  await runPowerShell(resolve(PACKAGE_ROOT, 'Start-WindowSurfaceOverlay.ps1'), [
    '-Id', normalized.id,
    '-StateRoot', paths.stateDirectory,
    '-VisibilityPolicy', visibilityPolicy,
    '-RefreshSeconds', String(refreshSeconds),
  ], env);
  return { ...(await overlayStatus(normalized.id, { stateRoot, env })), state: 'started' };
}

export async function stopOverlay({ id, stateRoot, env = process.env } = {}) {
  const normalizedId = requireId(id);
  const paths = overlayPaths(normalizedId, { stateRoot, env });
  await runPowerShell(resolve(PACKAGE_ROOT, 'Stop-WindowSurfaceOverlay.ps1'), [
    '-Id', normalizedId, '-StateRoot', paths.stateDirectory,
  ], env);
  return overlayStatus(normalizedId, { stateRoot, env });
}

export async function inspectOverlay({ id, stateRoot, env = process.env } = {}) {
  return overlayStatus(requireId(id), { stateRoot, env });
}

export async function readOverlayDocument({ id, stateRoot, env = process.env } = {}) {
  const document = await readJson(overlayPaths(requireId(id), { stateRoot, env }).document);
  return document ? createOverlayDocument(document) : null;
}

export async function removeOverlayState({ id, stateRoot, env = process.env } = {}) {
  const normalizedId = requireId(id);
  const paths = overlayPaths(normalizedId, { stateRoot, env });
  for (const path of [paths.pid, paths.refresh, paths.restartCommand, paths.document]) {
    try { await unlink(path); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  return overlayStatus(normalizedId, { stateRoot, env });
}