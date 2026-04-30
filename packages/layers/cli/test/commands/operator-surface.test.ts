import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  operatorSurfaceSendCommand,
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

async function admitIdentity(cwd: string, options: { capabilities?: string; submitStrategy?: string } = {}): Promise<void> {
  await operatorSurfaceIdentityAddCommand({
    cwd,
    identityName: 'narada-proper-builder',
    role: 'builder',
    agentKind: 'codex_cli',
    site: 'narada-proper',
    by: 'operator',
    inputCapabilities: options.capabilities ?? 'type_text,submit',
    submitStrategy: options.submitStrategy ?? 'known_surface_submit',
    format: 'json',
  }, createMockContext());
}

async function writeBindings(cwd: string, bindings: unknown[]): Promise<void> {
  await writeFile(join(cwd, 'operator-surfaces', 'runtime-bindings.json'), `${JSON.stringify({ bindings }, null, 2)}\n`, 'utf8');
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
      role_contract: {
        duties: expect.arrayContaining([expect.stringContaining('governed work packages')]),
        boundaries: expect.arrayContaining([expect.stringContaining('`next` means run this role normal duty loop')]),
        normal_loop_trigger: 'next',
      },
      binding_verification: {
        command: 'narada operator-surface labels build --site "narada-proper" --format json',
        expected_identity_id: 'narada-proper-architect',
        expected_role: 'architect',
        misbinding_error: expect.stringContaining('misbound'),
      },
    });
    expect((result.result as { copyable_text: string }).copyable_text).toContain('When Operator says `next`, run the normal duty loop for this role.');
    expect((result.result as { copyable_text: string }).copyable_text).toContain('Verify binding: narada operator-surface labels build --site "narada-proper" --format json');
    expect(existsSync(join(cwd, 'operator-surfaces', 'identities.json'))).toBe(true);
  });

  it('instantiates a builder surface with builder-specific duty loop text', async () => {
    const cwd = await tempRepo();
    const result = await operatorSurfaceAgentInstantiateCommand({
      cwd,
      site: 'narada-proper',
      role: 'builder',
      agentKind: 'codex_cli',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      role: 'builder',
      identity_id: 'narada-proper-builder',
      role_contract: {
        duties: expect.arrayContaining([expect.stringContaining('Execute approved local work packages')]),
        boundaries: expect.arrayContaining([expect.stringContaining('`next` means run this role normal duty loop')]),
      },
    });
    expect((result.result as { copyable_text: string }).copyable_text).toContain('When Operator says `next`, run the normal duty loop for this role.');
  });

  it('instantiates an observer surface without review authority', async () => {
    const cwd = await tempRepo();
    const result = await operatorSurfaceAgentInstantiateCommand({
      cwd,
      site: 'narada-proper',
      role: 'observer',
      agentKind: 'codex_cli',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      mutation_performed: true,
      role: 'observer',
      identity_id: 'narada-proper-observer',
      self_bind_instruction: 'narada operator-surface bind-focused --as self',
      role_contract: {
        duties: expect.arrayContaining([expect.stringContaining('Observe Narada law')]),
        boundaries: expect.arrayContaining([expect.stringContaining('Observer must not build')]),
      },
    });
    expect(JSON.stringify(result.result)).toContain('Observe coherence without building');
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
      allowed_roles: ['architect', 'builder', 'observer'],
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

  it('targets external Site-local operator-surface registry instead of caller cwd', async () => {
    const caller = await tempRepo();
    const site = await tempRepo();
    await writeFile(join(site, 'AGENTS.md'), '# Site Contract\n');
    await writeFile(join(site, 'config.json'), JSON.stringify({ site_id: 'client-site' }));

    const result = await operatorSurfaceAgentInstantiateCommand({
      cwd: caller,
      site,
      role: 'architect',
      agentKind: 'codex_cli',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      registry_path: join(site, 'operator-surfaces', 'identities.json'),
      registry_authority: {
        classification: 'target_site_local',
        cwd: caller,
        target_registry_cwd: site,
        warning: expect.stringContaining('--site resolves to'),
      },
    });
    expect(existsSync(join(caller, 'operator-surfaces', 'identities.json'))).toBe(false);
    expect(existsSync(join(site, 'operator-surfaces', 'identities.json'))).toBe(true);
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
      binding_verification: {
        expected_identity_id: 'narada-proper-architect',
        misbinding_error: expect.stringContaining('narada-proper-architect'),
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

  it('projects Site and role affinity colors as ergonomic hints', async () => {
    const cwd = await tempRepo();
    const add = await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-builder',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      label: 'Narada Proper Builder',
      siteAffinityColor: '#1f7a54',
      roleAffinityColor: '#c45a14',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(add.exitCode).toBe(ExitCode.SUCCESS);

    const labels = await operatorSurfaceLabelsBuildCommand({
      cwd,
      site: 'narada-proper',
      format: 'json',
    }, createMockContext());

    expect(labels.exitCode).toBe(ExitCode.SUCCESS);
    expect(labels.result).toMatchObject({
      labels: [{
        projection_hints: {
          site_line: {
            affinity_color: {
              value: '#1f7a54',
              source: 'site_metadata',
              authority: 'ergonomic_projection_hint',
            },
          },
          role_line: {
            affinity_color: {
              value: '#c45a14',
              source: 'role_metadata',
              authority: 'ergonomic_projection_hint',
            },
          },
          agent_name_line: {
            affinity_color: null,
          },
        },
      }],
    });
  });

  it('dry-runs operator-surface send through an admitted runtime binding', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeBindings(cwd, [{
      binding_id: 'bind-1',
      identity_id: 'narada-proper-builder',
      runtime_locus: 'pc-site',
      handle: 'hwnd:123',
      transport: 'operator_surface_input',
      submit_strategy: 'known_surface_submit',
      input_capabilities: ['type_text', 'submit'],
      status: 'active',
    }]);

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'next',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      mutation_performed: false,
      event_artifact: null,
      send: {
        identity: 'narada-proper-builder',
        runtime_locus: 'pc-site',
        resolved_runtime_handle: 'hwnd:123',
        submit_strategy: 'known_surface_submit',
        dry_run: true,
        status: 'validated_dry_run',
      },
    });
  });

  it('records bounded operator-surface send evidence when executed', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeBindings(cwd, [{
      binding_id: 'bind-1',
      identity_id: 'narada-proper-builder',
      runtime_locus: 'pc-site',
      handle: 'hwnd:123',
      transport: 'operator_surface_input',
      submit_strategy: 'operator_confirmed_submit',
      input_capabilities: ['type_text'],
      status: 'active',
    }]);

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'continue current task',
      execute: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = result.result as { event_artifact: string; send: { status: string; text_digest: string; text_length: number } };
    expect(payload.send).toMatchObject({
      status: 'event_recorded_for_runtime_locus',
      text_length: 'continue current task'.length,
    });
    expect(payload.send.text_digest).toHaveLength(64);
    expect(payload.event_artifact).toContain('.ai/operator-surface-events/ose_');
    const event = JSON.parse(await readFile(payload.event_artifact, 'utf8')) as { identity: string; text_digest: string };
    expect(event.identity).toBe('narada-proper-builder');
    expect(event.text_digest).toBe(payload.send.text_digest);
  });

  it('reports missing operator-surface binding with an exact unblock command', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'next',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'no_binding',
      unblock_command: 'narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus <pc-or-user-site>',
    });
  });

  it('reports ambiguous operator-surface bindings with a runtime-locus unblock', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeBindings(cwd, [
      { binding_id: 'bind-1', identity_id: 'narada-proper-builder', runtime_locus: 'pc-a', handle: 'hwnd:1', input_capabilities: ['type_text'], status: 'active' },
      { binding_id: 'bind-2', identity_id: 'narada-proper-builder', runtime_locus: 'pc-b', handle: 'hwnd:2', input_capabilities: ['type_text'], status: 'active' },
    ]);

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'next',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'ambiguous_binding',
      matching_bindings: [
        { binding_id: 'bind-1', runtime_locus: 'pc-a' },
        { binding_id: 'bind-2', runtime_locus: 'pc-b' },
      ],
      unblock_command: expect.stringContaining('Pass --runtime-locus'),
    });
  });

  it('reports missing transport and refuses secret-like operator-surface text', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd, { capabilities: '', submitStrategy: 'type_only' });
    await writeBindings(cwd, [{
      binding_id: 'bind-1',
      identity_id: 'narada-proper-builder',
      runtime_locus: 'pc-site',
      handle: 'hwnd:123',
      input_capabilities: [],
      status: 'active',
    }]);

    const missingTransport = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'next',
      format: 'json',
    }, createMockContext());
    expect(missingTransport.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(missingTransport.result).toMatchObject({
      reason: 'missing_transport',
      unblock_command: expect.stringContaining('Admit or repair Operator Surface transport'),
    });

    const secretLike = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'password is abc',
      format: 'json',
    }, createMockContext());
    expect(secretLike.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(secretLike.result).toMatchObject({
      reason: 'secret_like_text_refused',
      unblock_command: expect.stringContaining('secret references'),
    });
  });

  it('projects input capabilities and submit strategy with type-only default', async () => {
    const cwd = await tempRepo();
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-builder',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    const defaultLabels = await operatorSurfaceLabelsBuildCommand({
      cwd,
      site: 'narada-proper',
      format: 'json',
    }, createMockContext());

    expect(defaultLabels.result).toMatchObject({
      labels: [{
        input_posture: {
          capabilities: ['focus', 'type_text', 'clear_pending_input', 'recover_surface_state'],
          submit_strategy: 'type_only',
          automation_default: 'type_only',
          blind_submit_chord_probe_limit: 0,
          authority: 'ergonomic_projection_hint',
        },
      }],
    });
  });

  it('admits known submit strategy only when explicitly declared', async () => {
    const cwd = await tempRepo();
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-builder',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      inputCapabilities: 'focus,type_text,submit,clear_pending_input,recover_surface_state',
      submitStrategy: 'known_surface_submit',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    const labels = await operatorSurfaceLabelsBuildCommand({
      cwd,
      site: 'narada-proper',
      format: 'json',
    }, createMockContext());

    expect(labels.result).toMatchObject({
      labels: [{
        input_posture: {
          capabilities: ['focus', 'type_text', 'submit', 'clear_pending_input', 'recover_surface_state'],
          submit_strategy: 'known_surface_submit',
          blind_submit_chord_probe_limit: 0,
        },
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
