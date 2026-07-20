import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSiteAgentLaunchAdmission } from '../../src/commands/site-agent-launch-admission.js';

function result(status: 'launched' | 'failed', sessionId: string | null = null) {
  return {
    schema: 'narada.operator_console.agent_launch.v1' as const,
    status,
    site_id: 'sonar',
    agent_id: 'sonar.resident',
    session_id: sessionId,
    reason: status === 'failed' ? 'workspace_launch_failed' : null,
  };
}

function sharedAdmissionRoot(): string {
  return mkdtempSync(join(tmpdir(), 'site-agent-launch-admission-'));
}

describe('durable Site-agent launch admission', () => {
  it('coalesces callers from independent gateway processes onto one mutation', async () => {
    const root = sharedAdmissionRoot();
    const firstProcess = createSiteAgentLaunchAdmission({ root, pollMs: 1 });
    const secondProcess = createSiteAgentLaunchAdmission({ root, pollMs: 1 });
    let release: (() => void) | null = null;
    const mutation = vi.fn(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return result('launched', 'session-1');
    });
    const one = firstProcess.run('sonar/sonar.resident', mutation);
    const two = secondProcess.run('sonar/sonar.resident', mutation);
    await vi.waitFor(() => expect(mutation).toHaveBeenCalledTimes(1));
    release!();
    expect(await Promise.all([one, two])).toEqual([
      result('launched', 'session-1'),
      result('launched', 'session-1'),
    ]);
  });

  it('shares failure with current waiters but permits a later retry', async () => {
    const root = sharedAdmissionRoot();
    const firstProcess = createSiteAgentLaunchAdmission({ root, pollMs: 1 });
    const secondProcess = createSiteAgentLaunchAdmission({ root, pollMs: 1 });
    let release: (() => void) | null = null;
    const failedMutation = vi.fn(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return result('failed');
    });
    const one = firstProcess.run('sonar/sonar.resident', failedMutation);
    const two = secondProcess.run('sonar/sonar.resident', failedMutation);
    await vi.waitFor(() => expect(failedMutation).toHaveBeenCalledTimes(1));
    release!();
    expect(await Promise.all([one, two])).toEqual([result('failed'), result('failed')]);
    const retried = vi.fn(async () => result('launched', 'session-2'));
    expect(await secondProcess.run('sonar/sonar.resident', retried)).toEqual(result('launched', 'session-2'));
    expect(retried).toHaveBeenCalledTimes(1);
  });

  it('reuses a recent success during session-registration latency', async () => {
    const root = sharedAdmissionRoot();
    const firstProcess = createSiteAgentLaunchAdmission({ root, pollMs: 1 });
    const secondProcess = createSiteAgentLaunchAdmission({ root, pollMs: 1 });
    const mutation = vi.fn(async () => result('launched', 'session-3'));
    expect(await firstProcess.run('sonar/sonar.resident', mutation)).toEqual(result('launched', 'session-3'));
    expect(await secondProcess.run('sonar/sonar.resident', mutation)).toEqual(result('launched', 'session-3'));
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it('does not serialize distinct canonical agents', async () => {
    const root = sharedAdmissionRoot();
    const admission = createSiteAgentLaunchAdmission({ root, pollMs: 1 });
    const resident = vi.fn(async () => result('launched', 'session-resident'));
    const builder = vi.fn(async () => ({ ...result('launched', 'session-builder'), agent_id: 'sonar.builder' }));
    await Promise.all([
      admission.run('sonar/sonar.resident', resident),
      admission.run('sonar/sonar.builder', builder),
    ]);
    expect(resident).toHaveBeenCalledTimes(1);
    expect(builder).toHaveBeenCalledTimes(1);
  });
});
