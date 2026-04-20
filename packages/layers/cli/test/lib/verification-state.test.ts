import { vi } from 'vitest';
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  loadVerificationHistory,
  getRecentRuns,
  getFreshRuns,
  getStaleRuns,
  getOutlierCommands,
  getSlowestCommands,
} from '../../src/lib/verification-state.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function createTelemetryFile(dir: string, entries: unknown[]) {
  const metricsDir = join(dir, '.ai', 'metrics');
  mkdirSync(metricsDir, { recursive: true });
  writeFileSync(join(metricsDir, 'test-runtimes.json'), JSON.stringify(entries, null, 2));
}

describe('verification-state', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-verify-state-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty history when no telemetry file exists', () => {
    const history = loadVerificationHistory(tempDir);
    expect(history).toEqual([]);
  });

  it('loads and derives freshness from telemetry', () => {
    const now = Date.now();
    createTelemetryFile(tempDir, [
      {
        command: 'pnpm verify',
        startedAt: new Date(now - 5000).toISOString(),
        finishedAt: new Date(now - 1000).toISOString(),
        durationMs: 4000,
        exitStatus: 0,
        classification: 'success',
      },
      {
        command: 'pnpm --filter @narada2/cli exec vitest run test/commands/foo.test.ts',
        startedAt: new Date(now - 20 * 60 * 1000).toISOString(),
        finishedAt: new Date(now - 19 * 60 * 1000).toISOString(),
        durationMs: 60000,
        exitStatus: 0,
        classification: 'success',
      },
    ]);

    const history = loadVerificationHistory(tempDir);
    expect(history).toHaveLength(2);
    expect(history[0].freshness).toBe('fresh');
    expect(history[1].freshness).toBe('stale');
  });

  it('identifies outlier commands', () => {
    const now = Date.now();
    createTelemetryFile(tempDir, [
      {
        command: 'pnpm verify',
        startedAt: new Date(now - 5000).toISOString(),
        finishedAt: new Date(now - 1000).toISOString(),
        durationMs: 5000,
        exitStatus: 0,
        classification: 'success',
      },
      {
        command: 'pnpm verify',
        startedAt: new Date(now - 15000).toISOString(),
        finishedAt: new Date(now - 10000).toISOString(),
        durationMs: 5000,
        exitStatus: 0,
        classification: 'success',
      },
      {
        command: 'pnpm verify',
        startedAt: new Date(now - 25000).toISOString(),
        finishedAt: new Date(now - 24000).toISOString(),
        durationMs: 1000,
        exitStatus: 0,
        classification: 'success',
      },
      {
        command: 'pnpm verify',
        startedAt: new Date(now - 35000).toISOString(),
        finishedAt: new Date(now - 33000).toISOString(),
        durationMs: 2000,
        exitStatus: 0,
        classification: 'success',
      },
      {
        command: 'pnpm verify',
        startedAt: new Date(now - 60000).toISOString(),
        finishedAt: new Date(now - 30000).toISOString(),
        durationMs: 30000,
        exitStatus: 0,
        classification: 'success',
      },
    ]);

    const outliers = getOutlierCommands(tempDir);
    expect(outliers.length).toBeGreaterThan(0);
    expect(outliers[0].command).toBe('pnpm verify');
    expect(outliers[0].multiplier).toBeGreaterThan(3);
  });

  it('returns slowest commands', () => {
    const now = Date.now();
    createTelemetryFile(tempDir, [
      {
        command: 'pnpm verify',
        startedAt: new Date(now - 5000).toISOString(),
        finishedAt: new Date(now - 1000).toISOString(),
        durationMs: 4000,
        exitStatus: 0,
        classification: 'success',
      },
      {
        command: 'vitest run test/foo.test.ts',
        startedAt: new Date(now - 2000).toISOString(),
        finishedAt: new Date(now - 1000).toISOString(),
        durationMs: 1000,
        exitStatus: 0,
        classification: 'success',
      },
    ]);

    const slowest = getSlowestCommands(tempDir, 2);
    expect(slowest).toHaveLength(2);
    expect(slowest[0].command).toBe('pnpm verify');
    expect(slowest[0].durationMs).toBe(4000);
  });
});
