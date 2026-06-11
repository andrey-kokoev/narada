#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

process.env.NARADA_SITE_CONTINUITY_SYNC_TRIGGER ||= 'windows_task_scheduler';
process.env.NARADA_SITE_CONTINUITY_SCHEDULER_TASK_NAME ||= '\\Narada\\CloudflareSiteContinuitySync';
process.env.NARADA_SITE_CONTINUITY_SCHEDULER_INTERVAL_MINUTES ||= '5';

process.argv = [
  process.argv[0],
  fileURLToPath(new URL('./cloudflare-site-continuity-sync.mjs', import.meta.url)),
  'sync-once',
  ...process.argv.slice(2),
];

await import('./cloudflare-site-continuity-sync.mjs');
