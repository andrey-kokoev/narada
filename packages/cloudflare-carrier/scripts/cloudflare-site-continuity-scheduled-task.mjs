#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

loadLocalEnvFile(new URL('../../../.env', import.meta.url));
loadLocalEnvFile(new URL('../../../.narada/site-continuity/cloudflare-continuity.env', import.meta.url));

process.env.NARADA_SITE_CONTINUITY_SYNC_TRIGGER ||= 'windows_task_scheduler';
process.env.NARADA_SITE_CONTINUITY_SCHEDULER_TASK_NAME ||= '\\Narada\\CloudflareSiteContinuitySync';
process.env.NARADA_SITE_CONTINUITY_SCHEDULER_INTERVAL_MINUTES ||= '5';

process.argv = [
  process.argv[0],
  fileURLToPath(new URL('./cloudflare-site-continuity-scheduler.mjs', import.meta.url)),
  '--action',
  'reconcile-execute',
  '--live',
  ...process.argv.slice(2),
];

await import('./cloudflare-site-continuity-scheduler.mjs');

function loadLocalEnvFile(envUrl) {
  const envPath = fileURLToPath(envUrl);
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = stripEnvValueQuotes(trimmed.slice(separator + 1).trim());
    if (!process.env[key]) process.env[key] = value;
  }
}

function stripEnvValueQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
