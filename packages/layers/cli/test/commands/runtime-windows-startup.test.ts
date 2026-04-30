import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import {
  runtimeInstallWindowsStartupCommand,
  runtimeWindowsStartupStatusCommand,
} from '../../src/commands/runtime-windows-startup.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';

function createMockContext(): CommandContext {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
  return {
    configPath: '/test/config.json',
    logger: logger as unknown as CommandContext['logger'],
    verbose: false,
  };
}

const tempDirs: string[] = [];

async function tempSite(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'narada-runtime-startup-'));
  tempDirs.push(dir);
  await mkdir(join(dir, '.ai'), { recursive: true });
  await writeFile(join(dir, 'config.json'), JSON.stringify({ site_id: 'cpy-local' }, null, 2));
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('runtime windows-startup command', () => {
  it('returns a complete dry-run plan for a separate client runtime', async () => {
    const site = await tempSite();
    const result = await runtimeInstallWindowsStartupCommand({
      site,
      operation: 'cpy-support',
      mode: 'separate-client-runtime',
      credentialRef: 'env:GRAPH_CLIENT_SECRET',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as { status: string; mutation_performed: boolean; plan: Record<string, any> };
    expect(data.status).toBe('dry_run');
    expect(data.mutation_performed).toBe(false);
    expect(data.plan).toMatchObject({
      authority_locus: { site_id: 'cpy-local', operation: 'cpy-support' },
      runtime_mode: 'separate-client-runtime',
      windows_startup_substrate: {
        kind: 'task_scheduler',
        task_name: 'Narada-cpy-local-cpy-support',
      },
      environment_credential_posture: {
        raw_secrets_in_task: false,
        credential_ref: 'env:GRAPH_CLIENT_SECRET',
      },
    });
    expect(data.plan.command_line).toContain(site);
    expect(data.plan.command_line).toContain('cpy-support');
    expect(data.plan.paths).toMatchObject({
      log: expect.stringContaining('cpy-support.log'),
      pid: expect.stringContaining('cpy-support.pid'),
      health: expect.stringContaining('cpy-support.json'),
    });
    expect(data.plan.read_back_checks).toContain('task_command_targets_site_root');
    expect(data.plan.uninstall_command).toContain('schtasks /Delete');
  });

  it('distinguishes shared User Site runtime mode from separate client runtime mode', async () => {
    const site = await tempSite();
    const result = await runtimeInstallWindowsStartupCommand({
      site,
      operation: 'cpy-support',
      mode: 'shared-user-site-runtime',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = (result.result as { plan: { runtime_mode: string; runtime_mode_meaning: string } }).plan;
    expect(plan.runtime_mode).toBe('shared-user-site-runtime');
    expect(plan.runtime_mode_meaning).toContain('shared User Site runtime');
  });

  it('records deferred desired runtime posture and reads it back through status', async () => {
    const site = await tempSite();
    const deferred = await runtimeInstallWindowsStartupCommand({
      site,
      operation: 'cpy-support',
      mode: 'separate-client-runtime',
      defer: true,
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(deferred.exitCode).toBe(ExitCode.SUCCESS);
    const deferredData = deferred.result as { status: string; deferred: { path: string }; read_back: { status: string } };
    expect(deferredData.status).toBe('deferred');
    expect(deferredData.read_back.status).toBe('confirmed');
    expect(existsSync(deferredData.deferred.path)).toBe(true);

    const status = await runtimeWindowsStartupStatusCommand({
      site,
      operation: 'cpy-support',
      format: 'json',
    }, createMockContext());
    expect(status.exitCode).toBe(ExitCode.SUCCESS);
    expect((status.result as { deferred_posture: { status: string }; installed_startup_entry: { status: string } })).toMatchObject({
      deferred_posture: { status: 'recorded' },
      installed_startup_entry: { status: 'unknown_from_non_windows_locus' },
    });
  });

  it('refuses execute from non-owning runtime locus with exact unblock command', async () => {
    const site = await tempSite();
    const result = await runtimeInstallWindowsStartupCommand({
      site,
      operation: 'cpy-support',
      execute: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { reason: string; mutation_performed: boolean; unblock_command: string })).toMatchObject({
      reason: 'execution_deferred',
      mutation_performed: false,
    });
    expect((result.result as { unblock_command: string }).unblock_command).toContain('Windows runtime locus');
  });
});
