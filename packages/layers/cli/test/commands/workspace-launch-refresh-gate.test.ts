import { describe, expect, it } from 'vitest';
import { createWorkspaceLaunchRefreshGate } from '../../src/commands/workspace-launch-refresh-gate.js';

describe('workspace launch refresh gate', () => {
  it('coalesces concurrent refreshes and clears the gate after completion', async () => {
    const gate = createWorkspaceLaunchRefreshGate<string>(0);
    let resolveTask!: (value: string) => void;
    const task = new Promise<string>((resolve) => { resolveTask = resolve; });
    let calls = 0;
    const run = () => {
      calls += 1;
      return task;
    };

    const first = gate.run(run, () => 'fallback');
    const second = gate.run(run, () => 'fallback');
    expect(first).toBe(second);
    expect(calls).toBe(1);
    resolveTask('refreshed');
    await expect(first).resolves.toBe('refreshed');

    await expect(gate.run(async () => 'next', () => 'fallback')).resolves.toBe('next');
    expect(calls).toBe(1);
  });

  it('uses the fallback during the minimum refresh interval', async () => {
    const gate = createWorkspaceLaunchRefreshGate<string>(60_000);
    await expect(gate.run(async () => 'first', () => 'fallback')).resolves.toBe('first');
    await expect(gate.run(async () => 'second', () => 'fallback')).resolves.toBe('fallback');
  });
});
