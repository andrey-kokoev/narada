#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '../../../..');

export function buildSiteContinuityScheduledTaskSchedulerArgs({
  argv = [],
  env = process.env,
  repoRoot = REPO_ROOT,
} = {}) {
  const forwardedArgs = ['--action', 'reconcile-execute', '--live'];

  if (!hasAnyFlag(argv, ['--projection-url', '--url'])) {
    const projectionWorkerUrl = normalizeOptionalString(env.CLOUDFLARE_CARRIER_URL);
    if (projectionWorkerUrl) forwardedArgs.push('--url', projectionWorkerUrl);
  }

  if (!hasAnyFlag(argv, ['--operator-session-file'])) {
    const operatorSessionFile = normalizeOptionalString(env.CLOUDFLARE_OPERATOR_SESSION_FILE);
    if (operatorSessionFile) {
      forwardedArgs.push('--operator-session-file', resolveMaybeRelative(repoRoot, operatorSessionFile));
    }
  }

  return [...forwardedArgs, ...argv];
}

export function loadLocalEnvFile(envUrlOrPath, { env = process.env } = {}) {
  const envPath = typeof envUrlOrPath === 'string'
    ? envUrlOrPath
    : fileURLToPath(envUrlOrPath);
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = stripEnvValueQuotes(trimmed.slice(separator + 1).trim());
    if (!env[key]) env[key] = value;
  }
}

export function stripEnvValueQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function hasAnyFlag(argv, flags) {
  return argv.some((arg) => flags.includes(arg));
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function resolveMaybeRelative(basePath, value) {
  if (!value) return value;
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) return value;
  return resolve(basePath, value);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadLocalEnvFile(new URL('../../../../.env', import.meta.url));
  loadLocalEnvFile(new URL('../../../../.narada/site-continuity/cloudflare-continuity.env', import.meta.url));

  process.env.NARADA_SITE_CONTINUITY_SYNC_TRIGGER ||= 'windows_task_scheduler';
  process.env.NARADA_SITE_CONTINUITY_SCHEDULER_TASK_NAME ||= '\\Narada\\CloudflareSiteContinuitySync';
  process.env.NARADA_SITE_CONTINUITY_SCHEDULER_INTERVAL_MINUTES ||= '5';

  process.argv = [
    process.argv[0],
    fileURLToPath(new URL('./cloudflare-site-continuity-scheduler.mjs', import.meta.url)),
    ...buildSiteContinuityScheduledTaskSchedulerArgs({
      argv: process.argv.slice(2),
      env: process.env,
      repoRoot: REPO_ROOT,
    }),
  ];

  await import('./cloudflare-site-continuity-scheduler.mjs');
}
