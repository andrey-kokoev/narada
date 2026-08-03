import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  inspectOverlay,
  overlayPaths,
  publishOverlayDocument,
  requestOverlayRefresh,
} from '@narada-core/window-overlay-core';
import { attachGlidePaths, SCHEMA_VERSION } from './core.js';
import { fetchProviders, selectProviders } from './providers.js';
import { createQuotaMeterOverlayDocument } from './overlay.js';

const OVERLAY_ID = 'quota-meter';
const VERSION = '0.1.0';

function valueOf(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function parseArgs(args) {
  const providers = valueOf(args, '--providers') || 'all';
  const refreshSeconds = Number(valueOf(args, '--refresh-seconds') || 60);
  const stateRoot = valueOf(args, '--state-root');
  if (!Number.isInteger(refreshSeconds) || refreshSeconds < 5 || refreshSeconds > 3600) {
    throw new Error('refreshSeconds must be an integer between 5 and 3600');
  }
  selectProviders(providers);
  return { providers, refreshSeconds, stateRoot, noLogin: args.includes('--no-login') };
}

function optionsFor(env, stateRoot) {
  return { stateRoot: stateRoot || env.NARADA_WINDOW_SURFACE_OVERLAY_STATE_ROOT || env.QUOTA_METER_STATE_ROOT, env };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function publishPayload(payload, overlayOptions) {
  await publishOverlayDocument(
    OVERLAY_ID,
    createQuotaMeterOverlayDocument(payload),
    overlayOptions,
  );
  await requestOverlayRefresh(OVERLAY_ID, overlayOptions);
}

async function refreshOnce(options, env) {
  const overlayOptions = optionsFor(env, options.stateRoot);
  const status = await inspectOverlay({ id: OVERLAY_ID, ...overlayOptions });
  if (status.state !== 'running') return false;
  const providerResults = await fetchProviders(selectProviders(options.providers), {
    env,
    timeoutMs: 15_000,
    version: VERSION,
    interactive: false,
    json: true,
    noLogin: options.noLogin,
  });
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    command: 'overlay',
    providers: providerResults.map((result) => attachGlidePaths(result)),
  };
  await publishPayload(payload, overlayOptions);
  return true;
}

async function publishWorkerError(error, options, env) {
  const overlayOptions = optionsFor(env, options.stateRoot);
  const status = await inspectOverlay({ id: OVERLAY_ID, ...overlayOptions });
  if (status.state !== 'running') return false;
  await publishPayload({
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    command: 'overlay',
    providers: [{
      displayName: 'Quota Meter',
      status: 'error',
      windows: [],
      error: { message: String(error?.message || error) },
    }],
  }, overlayOptions);
  return true;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const env = process.env;
  const overlayOptions = optionsFor(env, options.stateRoot);
  const stateDirectory = overlayPaths(OVERLAY_ID, overlayOptions).stateDirectory;
  const pidPath = path.join(stateDirectory, 'quota-worker.pid');
  mkdirSync(stateDirectory, { recursive: true });
  writeFileSync(pidPath, String(process.pid) + '\n', 'utf8');
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    while (!stopping) {
      try {
        if (!await refreshOnce(options, env)) break;
      } catch (error) {
        try {
          if (!await publishWorkerError(error, options, env)) break;
        } catch {}
      }
      await sleep(options.refreshSeconds * 1000);
    }
  } finally {
    try { unlinkSync(pidPath); } catch {}
  }
}

run().catch(() => { process.exitCode = 1; });
