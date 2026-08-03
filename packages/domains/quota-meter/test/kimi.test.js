import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKimiResponse } from '../src/kimi.js';

test('Kimi usage response becomes normalized quota windows', () => {
  const windows = normalizeKimiResponse({
    usage: {
      limit: '100',
      used: '33',
      remaining: '67',
      resetTime: '2026-07-20T00:00:00.000Z',
    },
    limits: [{
      window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
      detail: {
        limit: '100',
        used: '10',
        remaining: '90',
        resetTime: '2026-07-19T17:00:00.000Z',
      },
    }],
  }, '2026-07-19T12:00:00.000Z');

  assert.equal(windows.length, 2);
  assert.equal(windows[0].usedPercent, 33);
  assert.equal(windows[0].remainingPercent, 67);
  assert.equal(windows[0].label, '7d');
  assert.equal(windows[0].durationSeconds, 7 * 24 * 60 * 60);
  assert.equal(windows[1].label, '5h');
  assert.equal(windows[1].usedPercent, 10);
});