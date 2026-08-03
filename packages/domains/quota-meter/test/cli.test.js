import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canPromptForLogin, run } from '../src/cli.js';
import { formatHuman } from '../src/format.js';

test('JSON output does not disable interactive login unless --no-login is set', () => {
  const tty = { isTTY: true };
  assert.equal(canPromptForLogin({ json: true, noLogin: false }, tty, tty), true);
  assert.equal(canPromptForLogin({ json: false, noLogin: true }, tty, tty), false);
  assert.equal(canPromptForLogin({ json: true, noLogin: false }, { isTTY: false }, tty), false);
});

test('providers command is offline and machine-readable', async () => {
  const result = await run(['providers', '--json']);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.output);
  assert.deepEqual(payload.providers.map((provider) => provider.id), ['codex', 'kimi']);
});

test('refresh command signals a running overlay', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'quota-meter-refresh-'));
  const stateDirectory = path.join(stateRoot, 'quota-meter');
  try {
    await mkdir(stateDirectory);
    await writeFile(path.join(stateDirectory, 'overlay.pid'), String(process.pid));
    const result = await run(['refresh', '--json'], { NARADA_WINDOW_SURFACE_OVERLAY_STATE_ROOT: stateRoot });
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.output).status, 'requested');
    assert.match(await readFile(path.join(stateDirectory, 'refresh.signal'), 'utf8'), /\S+/);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('help documents the transparent glide overlay lifecycle', async () => {
  const result = await run(['overlay', '--help']);
  assert.equal(result.code, 0);
  assert.match(result.output, /overlay\s+Launch a transparent/);
  assert.match(result.output, /quota-meter overlay --stop/);
  assert.match(result.output, /--restart/);
});

test('human report renders one table per provider and reset scenario as a row', () => {
  const now = Date.parse('2026-07-19T12:00:00.000Z');
  const output = formatHuman({
    generatedAt: '2026-07-19T12:00:00.000Z',
    providers: [
      {
        displayName: 'Codex',
        plan: 'pro',
        status: 'ok',
        windows: [{
          label: '7d',
          usedPercent: 50,
          remainingPercent: 50,
          resetAt: '2026-07-19T16:00:00.000Z',
          glidePath: {
            usedPercent: 50,
            elapsedTimePercent: 50,
            glidePathFactor: 1,
            status: 'at-risk',
            averageBurnRatePercentPerHour: 10,
            sustainableRatePercentPerHour: 10,
            withOneReset: {
              glidePathFactor: 0.5,
              status: 'on-track',
              nextExpirationAt: '2026-07-20T12:00:00.000Z',
              nextExpirationInHours: 24,
            },
          },
        }],
      },
      {
        displayName: 'Kimi Code',
        status: 'ok',
        windows: [{
          label: '5h',
          usedPercent: 10,
          remainingPercent: 90,
          resetAt: '2026-07-19T17:00:00.000Z',
          glidePath: {
            elapsedTimePercent: 20,
            glidePathFactor: 0.5,
            status: 'on-track',
            averageBurnRatePercentPerHour: 2,
            sustainableRatePercentPerHour: 18,
          },
        }],
      },
    ],
  }, now);

  assert.equal((output.match(/\| Window\s+\|/g) ?? []).length, 2);
  assert.match(output, /\| 7d\s+\|/);
  assert.match(output, /\| 7d@1 reset\s+\|\s+25.0%\s+\|\s+75.0%\s+\|/);
  assert.match(output, /\| 5h\s+\|/);
  const resetRow = output.split('\n').find((line) => line.includes('| 7d@1 reset'));
  assert.ok(resetRow);
  assert.doesNotMatch(resetRow, /next reset credit expires/);
  assert.match(output, /notes: next reset credit expires/);
});