import { vi } from 'vitest';
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { verifyStatusCommand } from '../../src/commands/verify-status.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function createTelemetry(dir: string, entries: unknown[]) {
  const d = join(dir, '.ai', 'metrics');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'test-runtimes.json'), JSON.stringify(entries));
}

describe('verify-status command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-verify-status-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty summary when no telemetry', async () => {
    const result = await verifyStatusCommand(
      { cwd: tempDir },
      { configPath: './config.json', verbose: false, logger: {} as any },
    );
    expect(result.exitCode).toBe(0);
    expect((result.result as any).summary.total_recorded).toBe(0);
  });

  it('reports recent runs', async () => {
    const now = Date.now();
    createTelemetry(tempDir, [
      {
        command: 'pnpm verify',
        startedAt: new Date(now - 5000).toISOString(),
        finishedAt: new Date(now - 1000).toISOString(),
        durationMs: 4000,
        exitStatus: 0,
        classification: 'success',
      },
    ]);

    const result = await verifyStatusCommand(
      { cwd: tempDir },
      { configPath: './config.json', verbose: false, logger: {} as any },
    );
    expect(result.exitCode).toBe(0);
    const data = result.result as any;
    expect(data.summary.total_recorded).toBe(1);
    expect(data.recent_runs).toHaveLength(1);
    expect(data.recent_runs[0].command).toBe('pnpm verify');
  });
});
