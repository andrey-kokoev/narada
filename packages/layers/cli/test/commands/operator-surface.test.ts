import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import {
  operatorSurfaceAgentInstantiateCommand,
  operatorSurfaceBindingDeferredCommand,
  operatorSurfaceBindFocusedCommand,
  operatorSurfaceIdentityAddCommand,
  operatorSurfaceLabelsBuildCommand,
} from '../../src/commands/operator-surface.js';

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

async function tempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'narada-operator-surface-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  delete process.env.NARADA_AGENT_ID;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('operator-surface commands', () => {
  it('instantiates an architect surface through one high-level command', async () => {
    const cwd = await tempRepo();
    const result = await operatorSurfaceAgentInstantiateCommand({
      cwd,
      site: 'narada-proper',
      role: 'architect',
      agentKind: 'codex_cli',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      mutation_performed: true,
      dry_run: false,
      role: 'architect',
      identity_id: 'narada-proper-architect',
      self_bind_instruction: 'narada operator-surface bind-focused --as self',
    });
    expect(existsSync(join(cwd, 'operator-surfaces', 'identities.json'))).toBe(true);
  });

  it('rejects unknown instantiate roles without mutation', async () => {
    const cwd = await tempRepo();
    const result = await operatorSurfaceAgentInstantiateCommand({
      cwd,
      site: 'narada-proper',
      role: 'reviewer',
      agentKind: 'codex_cli',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      mutation_performed: false,
      allowed_roles: ['architect', 'builder'],
    });
    expect(existsSync(join(cwd, 'operator-surfaces', 'identities.json'))).toBe(false);
  });

  it('supports dry-run instantiate without identity mutation', async () => {
    const cwd = await tempRepo();
    const result = await operatorSurfaceAgentInstantiateCommand({
      cwd,
      site: 'narada-proper',
      role: 'architect',
      agentKind: 'codex_cli',
      by: 'operator',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      mutation_performed: false,
      dry_run: true,
      identity_id: 'narada-proper-architect',
    });
    expect(existsSync(join(cwd, 'operator-surfaces', 'identities.json'))).toBe(false);
  });

  it('reuses an existing instantiate identity instead of rewriting it', async () => {
    const cwd = await tempRepo();
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-architect',
      role: 'architect',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      label: 'Existing Architect',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    const result = await operatorSurfaceAgentInstantiateCommand({
      cwd,
      site: 'narada-proper',
      role: 'architect',
      agentKind: 'codex_cli',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      mutation_performed: false,
      identity: {
        status: 'reused',
        identity: {
          label: 'Existing Architect',
        },
      },
    });
  });

  it('returns runtime-locus deferral when focused binding is requested', async () => {
    const cwd = await tempRepo();
    const result = await operatorSurfaceAgentInstantiateCommand({
      cwd,
      site: 'narada-proper',
      role: 'architect',
      agentKind: 'codex_cli',
      by: 'operator',
      bindFocused: true,
      runtimeLocus: 'pc-site',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      runtime_binding: {
        status: 'deferred',
        runtime_binding_mutated: false,
        deferred_command: 'Route to owning runtime locus: narada operator-surface bind-focused --identity narada-proper-architect --runtime-locus pc-site',
      },
    });
  });

  it('returns compact human output for instantiate', async () => {
    const cwd = await tempRepo();
    const result = await operatorSurfaceAgentInstantiateCommand({
      cwd,
      site: 'narada-proper',
      role: 'architect',
      agentKind: 'codex_cli',
      by: 'operator',
      format: 'human',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(String((result.result as { _formatted: string })._formatted)).toContain('Instantiate architect');
    expect(String((result.result as { _formatted: string })._formatted)).toContain('Self-bind: narada operator-surface bind-focused --as self');
  });

  it('admits durable identities and builds bounded UI-ready labels without direct JSON editing', async () => {
    const cwd = await tempRepo();
    const add = await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-builder',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      label: 'Narada Proper Builder',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(add.exitCode).toBe(ExitCode.SUCCESS);
    expect(add.result).toMatchObject({
      status: 'success',
      mutation_performed: true,
      runtime_binding_mutated: false,
      identity: {
        identity_id: 'narada-proper-builder',
        site_id: 'narada-proper',
        role: 'builder',
        agent_kind: 'codex_cli',
      },
    });
    expect(existsSync(join(cwd, 'operator-surfaces', 'identities.json'))).toBe(true);

    const labels = await operatorSurfaceLabelsBuildCommand({
      cwd,
      site: 'narada-proper',
      format: 'json',
    }, createMockContext());

    expect(labels.exitCode).toBe(ExitCode.SUCCESS);
    expect(labels.result).toMatchObject({
      status: 'success',
      mutation_performed: false,
      count: 1,
      labels: [{
        identity_id: 'narada-proper-builder',
        label: 'Narada Proper Builder',
        role: 'builder',
      }],
    });
  });

  it('resolves bind-as-self from governed runtime context and defers volatile handle mutation', async () => {
    const cwd = await tempRepo();
    process.env.NARADA_AGENT_ID = 'narada-proper-builder';
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-builder',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    const result = await operatorSurfaceBindFocusedCommand({
      cwd,
      as: 'self',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'deferred',
      reason: 'runtime_locus_required',
      identity: 'narada-proper-builder',
      mutation_performed: false,
      runtime_binding_mutated: false,
      self_resolution: {
        identity: 'narada-proper-builder',
        source: 'environment',
      },
    });
  });

  it('refuses unknown identities for binding and reports authority split', async () => {
    const cwd = await tempRepo();
    const result = await operatorSurfaceBindFocusedCommand({
      cwd,
      identity: 'missing-identity',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'identity_not_admitted',
      identity: 'missing-identity',
      runtime_binding_mutated: false,
      blockers: ['identity not admitted: missing-identity'],
    });
  });

  it('defers rebind unbind list and clean-stale to the owning runtime locus', async () => {
    const cwd = await tempRepo();
    for (const action of ['rebind', 'unbind', 'list', 'clean-stale'] as const) {
      const result = await operatorSurfaceBindingDeferredCommand(action, { cwd, format: 'json' }, createMockContext());
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toMatchObject({
        status: 'deferred',
        action,
        mutation_performed: false,
        runtime_binding_mutated: false,
        reason: 'runtime_locus_required',
      });
    }
  });
});
