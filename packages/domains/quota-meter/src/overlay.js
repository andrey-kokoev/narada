import { mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createOverlayDocument,
  inspectOverlay,
  overlayPaths,
  publishOverlayDocument,
  requestOverlayFocus as requestWindowOverlayFocus,
  requestOverlayRefresh as requestWindowOverlayRefresh,
  startOverlay as startWindowOverlay,
  stopOverlay as stopWindowOverlay,
} from '@narada-core/window-overlay-core';

export const QUOTA_METER_OVERLAY_ID = 'quota-meter';
const GLIDE_FACTOR_TOOLTIP = 'The final number is the glide factor: projected usage pace relative to sustainable pace.';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const workerScriptPath = path.join(sourceDirectory, 'overlay-worker.js');

function overlayOptions(env = process.env) {
  return {
    stateRoot: env.NARADA_WINDOW_SURFACE_OVERLAY_STATE_ROOT || env.QUOTA_METER_STATE_ROOT,
    env,
  };
}

function overlayStateDirectory(env = process.env) {
  return overlayPaths(QUOTA_METER_OVERLAY_ID, overlayOptions(env)).stateDirectory;
}

export function overlayWorkerPidPath(env = process.env) {
  return path.join(overlayStateDirectory(env), 'quota-worker.pid');
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function readWorkerPid(env = process.env) {
  try {
    const pid = Number.parseInt(readFileSync(overlayWorkerPidPath(env), 'utf8').trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function percent(value) {
  return value === null || value === undefined ? 'n/a' : Number(value).toFixed(1) + '%';
}

function toneForStatus(status) {
  if (status === 'over' || status === 'error' || status === 'auth_required') return 'danger';
  if (status === 'under' || status === 'in-range' || status === 'ok') return 'success';
  return 'warning';
}

function oneResetGlideView(window, glide, reset) {
  const multiplier = reset.capacityMultiplier || 2;
  const usedPercent = window.usedPercent === null || window.usedPercent === undefined
    ? null
    : window.usedPercent / multiplier;
  const remainingPercent = usedPercent === null ? null : 100 - usedPercent;
  return {
    ...glide,
    usedPercent,
    remainingPercent,
  };
}

function providerRows(result) {
  const rows = [];
  const name = result.displayName || result.name || result.id || 'Provider';
  if (result.status !== 'ok') {
    const detail = result.error?.message || result.loginCommand || result.status || 'unavailable';
    rows.push({ label: name, value: String(detail), tone: toneForStatus(result.status) });
    return rows;
  }
  for (const window of result.windows || []) {
    const glide = window.glidePath || {};
    const factor = glide.glidePathFactor === null || glide.glidePathFactor === undefined
      ? 'n/a'
      : Number(glide.glidePathFactor).toFixed(2);
    rows.push({
      label: name + ' ' + window.label,
      value: percent(window.usedPercent) + ' used · ' + percent(window.remainingPercent)
        + ' left · ' + factor,
      tone: toneForStatus(glide.status),
      tooltip: GLIDE_FACTOR_TOOLTIP,
    });

    const reset = glide.withOneReset;
    if (reset && reset.glidePathFactor !== null && reset.glidePathFactor !== undefined) {
      const resetGlide = oneResetGlideView(window, glide, reset);
      rows.push({
        label: name + ' ' + window.label + '@1 reset',
        value: percent(resetGlide.usedPercent) + ' used · ' + percent(resetGlide.remainingPercent)
          + ' left · ' + Number(reset.glidePathFactor).toFixed(2),
        tone: toneForStatus(reset.status),
        tooltip: GLIDE_FACTOR_TOOLTIP,
      });
    }
  }
  if (rows.length === 0) rows.push({ label: name, value: 'No quota windows reported', tone: 'muted' });
  return rows;
}

export function createQuotaMeterOverlayDocument(payload = {}) {
  const providers = Array.isArray(payload.providers) ? payload.providers : [];
  const rows = providers.flatMap(providerRows);
  if (rows.length === 0) rows.push({ label: 'Quota', value: 'Loading provider quotas...', tone: 'muted' });
  const subtitle = payload.generatedAt
    ? 'Updated ' + String(payload.generatedAt)
    : 'Loading provider quotas...';
  return createOverlayDocument({
    id: QUOTA_METER_OVERLAY_ID,
    title: 'Quota Meter',
    title_tone: 'accent',
    subtitle,
    rows,
    actions: [
      { id: 'refresh', label: 'Refresh', kind: 'refresh', tone: 'accent', icon: '⟳', tooltip: 'Refresh quotas' },
    ],
  });
}

export async function publishQuotaMeterOverlayDocument(payload, env = process.env) {
  return publishOverlayDocument(
    QUOTA_METER_OVERLAY_ID,
    createQuotaMeterOverlayDocument(payload),
    overlayOptions(env),
  );
}

function workerArguments(options, env) {
  const args = [workerScriptPath, '--providers', options.providers || 'all',
    '--refresh-seconds', String(options.refreshSeconds || 60)];
  const stateRoot = overlayOptions(env).stateRoot;
  if (stateRoot) args.push('--state-root', stateRoot);
  if (options.noLogin) args.push('--no-login');
  return args;
}

async function waitForWorkerPid(env, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const pid = readWorkerPid(env);
    if (pid && processIsRunning(pid)) return pid;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('quota_meter_overlay_worker_start_timeout');
}

async function ensureWorker(options, env) {
  const existing = readWorkerPid(env);
  if (existing && processIsRunning(existing)) return existing;
  const stateDirectory = overlayStateDirectory(env);
  mkdirSync(stateDirectory, { recursive: true });
  const child = spawn(process.execPath, workerArguments(options, env), {
    cwd: sourceDirectory,
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
    env,
  });
  child.unref();
  return waitForWorkerPid(env);
}

async function stopWorker(env) {
  const pid = readWorkerPid(env);
  if (pid && processIsRunning(pid)) {
    try { process.kill(pid); } catch (error) { if (error?.code !== 'ESRCH') throw error; }
  }
  try { unlinkSync(overlayWorkerPidPath(env)); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export async function startQuotaMeterOverlay(options = {}, env = process.env) {
  if (process.platform !== 'win32') throw new Error('the overlay command currently requires Windows');
  const before = await inspectOverlay({ id: QUOTA_METER_OVERLAY_ID, ...overlayOptions(env) });
  const result = await startWindowOverlay({
    id: QUOTA_METER_OVERLAY_ID,
    document: createQuotaMeterOverlayDocument(),
    visibilityPolicy: 'terminal-group',
    refreshSeconds: 2,
    ...overlayOptions(env),
  });
  await ensureWorker(options, env);
  return {
    code: 0,
    status: before.state === 'running' ? 'already_running' : 'started',
    output: before.state === 'running'
      ? 'quota-meter overlay already running'
      : 'quota-meter overlay started (refresh every ' + (options.refreshSeconds || 60) + 's)',
    overlay: result,
  };
}

export async function stopQuotaMeterOverlay(env = process.env) {
  await stopWorker(env);
  const result = await stopWindowOverlay({ id: QUOTA_METER_OVERLAY_ID, ...overlayOptions(env) });
  return { code: 0, status: 'stopped', output: 'quota-meter overlay stopped', overlay: result };
}

export async function requestQuotaMeterOverlayRefresh(env = process.env) {
  const status = await inspectOverlay({ id: QUOTA_METER_OVERLAY_ID, ...overlayOptions(env) });
  if (status.state !== 'running') throw new Error('quota-meter overlay is not running');
  return requestWindowOverlayRefresh(QUOTA_METER_OVERLAY_ID, overlayOptions(env));
}

export async function focusQuotaMeterOverlay(env = process.env) {
  return requestWindowOverlayFocus(QUOTA_METER_OVERLAY_ID, overlayOptions(env));
}

export async function overlayStatus(env = process.env) {
  const overlay = await inspectOverlay({ id: QUOTA_METER_OVERLAY_ID, ...overlayOptions(env) });
  const workerPid = readWorkerPid(env);
  return {
    ...overlay,
    worker_pid: workerPid,
    worker_running: Boolean(workerPid && processIsRunning(workerPid)),
  };
}

export async function launchOverlay(options = {}, env = process.env) {
  if (options.stop) return stopQuotaMeterOverlay(env);
  if (options.restart) {
    const current = await overlayStatus(env);
    if (current.state === 'running') await stopQuotaMeterOverlay(env);
  }
  return startQuotaMeterOverlay(options, env);
}

// Keep the domain-facing names stable while the generic lifecycle lives in window-overlay-core.
export const requestOverlayRefresh = requestQuotaMeterOverlayRefresh;

