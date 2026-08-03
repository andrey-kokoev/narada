import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateGlidePath, percentFromValues, summarizeResetCredits } from '../src/core.js';

test('percentFromValues normalizes used and remaining quota', () => {
  assert.deepEqual(percentFromValues({ limit: '100', used: '25' }), {
    usedPercent: 25,
    remainingPercent: 75,
  });
  assert.deepEqual(percentFromValues({ limit: '100', remaining: '40' }), {
    usedPercent: 60,
    remainingPercent: 40,
  });
});

test('glide path reports sustainable pace below one', () => {
  const now = Date.parse('2026-07-19T12:00:00.000Z');
  const window = {
    usedPercent: 20,
    remainingPercent: 80,
    resetAt: '2026-07-19T16:00:00.000Z',
    durationSeconds: 8 * 60 * 60,
  };
  const glide = calculateGlidePath(window, now);

  assert.equal(glide.averageBurnRatePercentPerHour, 5);
  assert.equal(glide.sustainableRatePercentPerHour, 20);
  assert.equal(glide.elapsedTimePercent, 50);
  assert.equal(glide.glidePathFactor, 0.4);
  assert.equal(glide.status, 'under');
  assert.equal(glide.exhaustsBeforeReset, false);
});

test('glide path reports early exhaustion above one', () => {
  const now = Date.parse('2026-07-19T12:00:00.000Z');
  const window = {
    usedPercent: 80,
    remainingPercent: 20,
    resetAt: '2026-07-20T04:00:00.000Z',
    durationSeconds: 20 * 60 * 60,
  };
  const glide = calculateGlidePath(window, now);

  assert.equal(glide.glidePathFactor, 4);
  assert.equal(glide.status, 'over');
  assert.equal(glide.exhaustsBeforeReset, true);
});

test('glide path does not require a previous sample', () => {
  const now = Date.parse('2026-07-19T12:00:00.000Z');
  const glide = calculateGlidePath({
    usedPercent: 25,
    remainingPercent: 75,
    resetAt: '2026-07-19T16:00:00.000Z',
    durationSeconds: 8 * 60 * 60,
  }, now);

  assert.equal(glide.glidePathFactor, 0.5);
  assert.equal(glide.status, 'under');
});

test('glide path reports unknown duration explicitly', () => {
  const glide = calculateGlidePath({
    usedPercent: 25,
    remainingPercent: 75,
    resetAt: '2026-07-19T16:00:00.000Z',
  }, Date.parse('2026-07-19T12:00:00.000Z'));

  assert.equal(glide.glidePathFactor, null);
  assert.equal(glide.status, 'window-duration-unknown');
});

test('glide path exposes reset-aware capacity and expiration', () => {
  const now = Date.parse('2026-07-19T12:00:00.000Z');
  const credits = summarizeResetCredits({
    availableCount: 1,
    credits: [{
      id: 'reset-1',
      status: 'available',
      title: 'Full reset',
      expiresAt: '2026-07-20T12:00:00.000Z',
    }],
  }, now);
  const glide = calculateGlidePath({
    usedPercent: 50,
    remainingPercent: 50,
    resetAt: '2026-07-19T16:00:00.000Z',
    durationSeconds: 8 * 60 * 60,
  }, now, credits);

  assert.equal(glide.glidePathFactor, 1);
  assert.equal(glide.withAvailableResets.glidePathFactor, 0.5);
  assert.equal(glide.withAvailableResets.status, 'under');
  assert.equal(glide.withOneReset.glidePathFactor, 0.5);
  assert.equal(glide.withOneReset.status, 'under');
  assert.equal(glide.withAvailableResets.nextExpirationAt, '2026-07-20T12:00:00.000Z');
  assert.equal(glide.withAvailableResets.nextExpirationInHours, 24);
});

test('glide path treats 0.98 through 1.03 as in-range', () => {
  const now = Date.parse('2026-07-19T12:00:00.000Z');
  const baseWindow = {
    remainingPercent: 50,
    resetAt: '2026-07-19T16:00:00.000Z',
    durationSeconds: 8 * 60 * 60,
  };

  const lower = calculateGlidePath({ ...baseWindow, usedPercent: 49 }, now);
  const upper = calculateGlidePath({ ...baseWindow, usedPercent: 51.5 }, now);

  assert.equal(lower.glidePathFactor, 0.98);
  assert.equal(lower.status, 'in-range');
  assert.equal(upper.glidePathFactor, 1.03);
  assert.equal(upper.status, 'in-range');
});