import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sitesBootstrapClientCommand,
  sitesDoctorCommand,
} from '../../src/commands/sites.js';
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

async function tempWorkspace(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('sitesBootstrapClientCommand', () => {
  it('dry-runs a contained client Site without writing', async () => {
    const workspace = await tempWorkspace('narada-client-dry-');
    const result = await sitesBootstrapClientCommand({
      workspace,
      siteId: 'utz',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.result as {
      status: string;
      mutation_performed: boolean;
      site_id: string;
      site_root: string;
      sync_posture: string;
      directories: string[];
      validation_commands: string[];
    };
    expect(data.status).toBe('dry_run');
    expect(data.mutation_performed).toBe(false);
    expect(data.site_id).toBe('utz');
    expect(data.site_root).toBe(join(workspace, '.narada'));
    expect(data.sync_posture).toBe('local_non_git');
    expect(data.directories).toContain(join(workspace, '.narada', '.ai', 'inbox-drop'));
    expect(data.validation_commands[0]).toContain('narada sites doctor utz --kind client');
    expect(existsSync(join(workspace, '.narada'))).toBe(false);
  });

  it('executes client Site bootstrap and passes client doctor', async () => {
    const workspace = await tempWorkspace('narada-client-exec-');
    const result = await sitesBootstrapClientCommand({
      workspace,
      siteId: 'utz',
      sync: 'onedrive_non_git',
      execute: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(existsSync(join(workspace, '.narada', 'config.json'))).toBe(true);
    expect(existsSync(join(workspace, '.narada', '.ai', 'inbox-drop', '.gitkeep'))).toBe(true);
    expect(existsSync(join(workspace, '.narada', '.ai', 'inbox-envelopes', '.gitkeep'))).toBe(true);

    const doctor = await sitesDoctorCommand('utz', {
      kind: 'client',
      root: workspace,
      format: 'json',
    }, createMockContext());
    expect(doctor.exitCode).toBe(ExitCode.SUCCESS);
    const doctorData = doctor.result as { status: string; checks: Array<{ name: string; status: string }> };
    expect(doctorData.status).toBe('passed');
    expect(doctorData.checks.find((check) => check.name === 'config_parse')?.status).toBe('pass');
    expect(doctorData.checks.find((check) => check.name === 'dir__ai_inbox_drop')?.status).toBe('pass');

    const agents = await readFile(join(workspace, '.narada', 'AGENTS.md'), 'utf8');
    expect(agents).toContain(`workspace_root: ${workspace}`);
    expect(agents).toContain(`site_root: ${join(workspace, '.narada')}`);
    expect(agents).toContain('outside site_root are not Narada knowledge, evidence, or authority unless explicitly admitted');
  });

  it('client doctor fails when the canonical inbox drop is missing', async () => {
    const workspace = await tempWorkspace('narada-client-bad-');
    await sitesBootstrapClientCommand({
      workspace,
      siteId: 'utz',
      execute: true,
      format: 'json',
    }, createMockContext());
    await rm(join(workspace, '.narada', '.ai', 'inbox-drop'), { recursive: true, force: true });

    const doctor = await sitesDoctorCommand('utz', {
      kind: 'client',
      root: workspace,
      format: 'json',
    }, createMockContext());
    expect(doctor.exitCode).toBe(ExitCode.GENERAL_ERROR);
    const data = doctor.result as { checks: Array<{ name: string; status: string }> };
    expect(data.checks.find((check) => check.name === 'dir__ai_inbox_drop')?.status).toBe('fail');
  });

  it('client doctor warns when governance artifacts are placed at the visible workspace root', async () => {
    const workspace = await tempWorkspace('narada-client-root-artifacts-');
    await sitesBootstrapClientCommand({
      workspace,
      siteId: 'utz',
      execute: true,
      format: 'json',
    }, createMockContext());
    await writeFile(join(workspace, 'AGENTS.md'), 'misplaced root governance\n', 'utf8');

    const doctor = await sitesDoctorCommand('utz', {
      kind: 'client',
      root: workspace,
      format: 'json',
    }, createMockContext());
    expect(doctor.exitCode).toBe(ExitCode.SUCCESS);
    const data = doctor.result as { status: string; checks: Array<{ name: string; status: string; message: string }> };
    expect(data.status).toBe('warning');
    const containment = data.checks.find((check) => check.name === 'client_workspace_containment');
    expect(containment?.status).toBe('warn');
    expect(containment?.message).toContain('outside .narada');
  });
});
