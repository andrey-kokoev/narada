import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  buildSiteContinuityScheduledTaskSchedulerArgs,
  stripEnvValueQuotes,
} from '../workflows/cloudflare-site-continuity-scheduled-task.mjs';

test('site continuity scheduled task injects env-backed operator context when argv does not provide it', () => {
  const repoRoot = 'D:\\code\\narada';
  const args = buildSiteContinuityScheduledTaskSchedulerArgs({
    argv: ['--format', 'text'],
    env: {
      CLOUDFLARE_CARRIER_URL: 'https://carrier.example',
      CLOUDFLARE_OPERATOR_SESSION_FILE: '.narada/auth/cloudflare-operator-session.json',
    },
    repoRoot,
  });

  assert.deepEqual(args, [
    '--action',
    'reconcile-execute',
    '--live',
    '--url',
    'https://carrier.example',
    '--operator-session-file',
    resolve(repoRoot, '.narada/auth/cloudflare-operator-session.json'),
    '--format',
    'text',
  ]);
});

test('site continuity scheduled task preserves explicit operator context over env-backed defaults', () => {
  const args = buildSiteContinuityScheduledTaskSchedulerArgs({
    argv: [
      '--url',
      'https://override.example',
      '--operator-session-file',
      'D:\\override\\session.json',
    ],
    env: {
      CLOUDFLARE_CARRIER_URL: 'https://carrier.example',
      CLOUDFLARE_OPERATOR_SESSION_FILE: '.narada/auth/cloudflare-operator-session.json',
    },
    repoRoot: 'D:\\code\\narada',
  });

  assert.deepEqual(args, [
    '--action',
    'reconcile-execute',
    '--live',
    '--url',
    'https://override.example',
    '--operator-session-file',
    'D:\\override\\session.json',
  ]);
});

test('site continuity scheduled task strips matching env quotes only', () => {
  assert.equal(stripEnvValueQuotes('"quoted"'), 'quoted');
  assert.equal(stripEnvValueQuotes("'single-quoted'"), 'single-quoted');
  assert.equal(stripEnvValueQuotes('plain'), 'plain');
});
