import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import {
  operatorSurfaceAgentInstantiateCommand,
  operatorSurfaceBindingDeferredCommand,
  operatorSurfaceBindFocusedCommand,
  operatorSurfaceIdentityAddCommand,
  operatorSurfaceIdentityRenameCommand,
  operatorSurfaceLabelsBuildCommand,
  operatorSurfaceSendCommand,
  operatorSurfaceStatusCommand,
  operatorSurfaceVoiceTranscriptionCheckCommand,
} from '../../src/commands/operator-surface.js';
import { capabilityGrantCommand } from '../../src/commands/capability.js';
import { saveRoster } from '../../src/lib/task-governance.js';

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

async function writeVisibleLabels(cwd: string, labels: unknown[]): Promise<void> {
  await writeFile(join(cwd, 'operator-surfaces', 'visible-labels.json'), `${JSON.stringify({ labels }, null, 2)}\n`, 'utf8');
}

async function writeRoster(cwd: string, agents: unknown[]): Promise<void> {
  mkdirSync(join(cwd, '.ai', 'agents'), { recursive: true });
  await writeFile(join(cwd, '.ai', 'agents', 'roster.json'), `${JSON.stringify({
    version: 2,
    updated_at: '2026-04-30T16:00:00.000Z',
    agents,
  }, null, 2)}\n`, 'utf8');
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

  it('renames an operator-surface identity while preserving role alias and migration evidence', async () => {
    const cwd = await tempRepo();
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-andrey.architect',
      role: 'architect',
      agentKind: 'codex_cli',
      site: 'narada-andrey',
      label: 'Narada Architect',
      by: 'operator',
      inputCapabilities: 'type_text,submit',
      submitStrategy: 'known_surface_submit',
      format: 'json',
    }, createMockContext());
    await writeBindings(cwd, [
      { binding_id: 'bind-1', identity_id: 'narada-andrey.architect', runtime_locus: 'pc-site', handle: 'hwnd:1', input_capabilities: ['type_text'], status: 'active' },
    ]);
    await writeVisibleLabels(cwd, [
      { identity_id: 'narada-andrey.architect', site_id: 'narada-andrey', role: 'architect', label: 'Narada Architect', runtime_locus: 'pc-site', status: 'visible' },
    ]);

    const result = await operatorSurfaceIdentityRenameCommand({
      cwd,
      fromIdentity: 'narada-andrey.architect',
      toIdentity: 'narada-andrey.Kevin',
      by: 'operator',
      label: 'Kevin',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      old_identity_id: 'narada-andrey.architect',
      new_identity_id: 'narada-andrey.Kevin',
      role: 'architect',
      immutable_history_preserved: true,
      projection_updates: {
        runtime_bindings: { status: 'updated' },
        visible_labels: { status: 'updated' },
      },
      current_addressability_aliases: expect.arrayContaining(['narada-andrey.Kevin', 'narada-andrey.architect', 'architect']),
    });
    const registry = JSON.parse(await readFile(join(cwd, 'operator-surfaces', 'identities.json'), 'utf8')) as { identities: Array<Record<string, unknown>> };
    expect(registry.identities).toHaveLength(1);
    expect(registry.identities[0]).toMatchObject({
      identity_id: 'narada-andrey.Kevin',
      previous_identity_ids: ['narada-andrey.architect'],
      role: 'architect',
      label: 'Kevin',
    });
    expect(existsSync(String((result.result as { migration_evidence_path: string }).migration_evidence_path))).toBe(true);
    const bindings = JSON.parse(await readFile(join(cwd, 'operator-surfaces', 'runtime-bindings.json'), 'utf8')) as { bindings: Array<Record<string, unknown>> };
    expect(bindings.bindings[0]?.identity_id).toBe('narada-andrey.Kevin');
  });

  it('fails identity rename closed when active assignment exists without explicit consent', async () => {
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
    await saveRoster(cwd, {
      version: 2,
      updated_at: '2026-04-30T16:00:00.000Z',
      agents: [{
        agent_id: 'narada-proper-builder',
        role: 'builder',
        capabilities: ['execute'],
        first_seen_at: '2026-04-30T16:00:00.000Z',
        last_active_at: '2026-04-30T16:00:00.000Z',
        status: 'working',
        task: 1139,
        last_done: null,
        updated_at: '2026-04-30T16:00:00.000Z',
      }],
    });

    const result = await operatorSurfaceIdentityRenameCommand({
      cwd,
      fromIdentity: 'narada-proper-builder',
      toIdentity: 'narada-proper.Kevin',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'active_assignment_requires_explicit_consent',
      mutation_performed: false,
      active_task: 1139,
      unblock_command: expect.stringContaining('--allow-active-assignment'),
    });
  });

  it('refuses identity rename across Site loci', async () => {
    const cwd = await tempRepo();
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-andrey.architect',
      role: 'architect',
      agentKind: 'codex_cli',
      site: 'narada-andrey',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    const result = await operatorSurfaceIdentityRenameCommand({
      cwd,
      fromIdentity: 'narada-andrey.architect',
      toIdentity: 'other-site.Kevin',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'site_locus_mismatch',
      mutation_performed: false,
      old_site_id: 'narada-andrey',
      requested_new_site_id: 'other-site',
      unblock_command: expect.stringContaining('governed cross-Site handoff'),
    });
  });

  it('migrates active roster pointer when identity rename is explicitly allowed', async () => {
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
    await saveRoster(cwd, {
      version: 2,
      updated_at: '2026-04-30T16:00:00.000Z',
      agents: [{
        agent_id: 'narada-proper-builder',
        role: 'builder',
        capabilities: ['execute'],
        first_seen_at: '2026-04-30T16:00:00.000Z',
        last_active_at: '2026-04-30T16:00:00.000Z',
        status: 'working',
        task: 1139,
        last_done: null,
        updated_at: '2026-04-30T16:00:00.000Z',
      }],
    });

    const result = await operatorSurfaceIdentityRenameCommand({
      cwd,
      fromIdentity: 'narada-proper-builder',
      toIdentity: 'narada-proper.Kevin',
      by: 'operator',
      allowActiveAssignment: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      projection_updates: {
        roster: { status: 'updated' },
      },
    });
    const status = await operatorSurfaceStatusCommand({ cwd, site: 'narada-proper', format: 'json' }, createMockContext());
    expect(status.result).toMatchObject({
      agents: [expect.objectContaining({
        identity_id: 'narada-proper.Kevin',
        work_status: 'working',
        current_task: 1139,
      })],
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
        handoff: {
          status: 'executable',
          command: 'narada operator-surface bind-focused --identity narada-proper-architect --runtime-locus pc-site',
        },
        deferred_command: 'narada operator-surface bind-focused --identity narada-proper-architect --runtime-locus pc-site',
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
      projection_boundary: {
        carrier_fields_are_projection: true,
        windows_identity_name_source: 'identity_id',
      },
      projection_compatibility: {
        status: 'pass',
        carrier: 'windows_focused_window_binding',
      },
      labels: [{
        identity_id: 'narada-proper-builder',
        identity_name: 'narada-proper-builder',
        label: 'Narada Proper Builder',
        presentation_label: 'Narada Proper Builder',
        role: 'builder',
        carrier_projection: {
          windows_focused_window_binding: {
            identity_name: 'narada-proper-builder',
            label: 'Narada Proper Builder',
            authority: 'projection_from_site_identity_record',
          },
          authority_boundary: expect.stringContaining('identity_id is Site authority'),
        },
      }],
    });
  });

  it('fails label carrier projection closed when durable identity records are incompatible', async () => {
    const cwd = await tempRepo();
    mkdirSync(join(cwd, 'operator-surfaces'), { recursive: true });
    await writeFile(join(cwd, 'operator-surfaces', 'identities.json'), JSON.stringify({
      schema: 'https://narada.dev/schemas/operator-surface-identities/v1',
      updated_at: '2026-04-30T22:00:00.000Z',
      identities: [{
        identity_name: 'narada-proper-builder',
        site_id: 'narada-proper',
        role: 'builder',
        agent_kind: 'codex_cli',
        label: 'Narada Proper Builder',
        admitted_by: 'operator',
        admitted_at: '2026-04-30T22:00:00.000Z',
        updated_at: '2026-04-30T22:00:00.000Z',
        authority_limits: [],
      }],
    }, null, 2));

    const labels = await operatorSurfaceLabelsBuildCommand({
      cwd,
      site: 'narada-proper',
      format: 'json',
    }, createMockContext());

    expect(labels.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(labels.result).toMatchObject({
      status: 'error',
      mutation_performed: false,
      reason: 'operator_surface_identity_registry_incompatible_with_carrier_projection',
      projection_boundary: {
        carrier_fields_are_projection: true,
        windows_identity_name_source: 'identity_id',
      },
      issues: [{
        field: 'identity_id',
        reason: expect.stringContaining('Windows carrier identity_name cannot be projected'),
        repair_command: expect.stringContaining('narada operator-surface identity add'),
      }],
      repair_guidance: expect.stringContaining('do not edit Windows carrier files as identity authority'),
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
      requested_address: 'narada-proper-builder',
      current_site: 'narada-proper',
      target_site: 'narada-proper',
      message_route: {
        sender: 'operator',
        requested_recipient: 'narada-proper-builder',
        resolved_recipient: 'narada-proper-builder',
        current_site: 'narada-proper',
        target_site: 'narada-proper',
        binding_status: 'bound',
        identity_flag_mode: 'deprecated_recipient_alias',
      },
      send: {
        identity: 'narada-proper-builder',
        sender: 'operator',
        recipient: 'narada-proper-builder',
        requested_address: 'narada-proper-builder',
        current_site: 'narada-proper',
        target_site: 'narada-proper',
        message_route: {
          sender: 'operator',
          requested_recipient: 'narada-proper-builder',
          resolved_recipient: 'narada-proper-builder',
          current_site: 'narada-proper',
          target_site: 'narada-proper',
          binding_status: 'bound',
        },
        site_plane: {
          current_site: 'narada-proper',
          target_site: 'narada-proper',
        },
        binding_proof: {
          binding_id: 'bind-1',
          runtime_locus: 'pc-site',
          status: 'bound',
        },
        runtime_locus: 'pc-site',
        resolved_runtime_handle: 'hwnd:123',
        submit_strategy: 'known_surface_submit',
        dry_run: true,
        status: 'validated_dry_run',
      },
    });
  });

  it('dry-runs operator-surface send with explicit from/to grammar for same-Site bare role', async () => {
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
      from: 'Operator',
      to: 'builder',
      currentSite: 'narada-proper',
      text: 'next',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      requested_address: 'builder',
      current_site: 'narada-proper',
      target_site: 'narada-proper',
      message_route: {
        sender: 'Operator',
        requested_recipient: 'builder',
        resolved_recipient: 'narada-proper-builder',
        current_site: 'narada-proper',
        target_site: 'narada-proper',
        identity_flag_mode: 'explicit_to',
      },
      send: {
        identity: 'narada-proper-builder',
        sender: 'Operator',
        recipient: 'narada-proper-builder',
        requested_address: 'builder',
        site_plane: {
          current_site: 'narada-proper',
          target_site: 'narada-proper',
        },
      },
    });
  });

  it('requires current Site plane for bare role recipients when Site cannot be inferred', async () => {
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
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-andrey-builder',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-andrey',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    const result = await operatorSurfaceSendCommand({
      cwd,
      to: 'builder',
      text: 'next',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'current_site_required_for_bare_role',
      requested_address: 'builder',
      current_site: null,
      target_site: null,
      unblock_command: 'Rerun with --current-site <site-id> or use a Site-qualified recipient such as <site>.builder.',
    });
  });

  it('resolves site-qualified role address to exact-one roster identity before operator-surface send', async () => {
    const cwd = await tempRepo();
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-andrey.Bob',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-andrey',
      by: 'operator',
      inputCapabilities: 'type_text,submit',
      submitStrategy: 'known_surface_submit',
      format: 'json',
    }, createMockContext());
    await writeBindings(cwd, [{
      binding_id: 'bind-bob',
      identity_id: 'narada-andrey.Bob',
      runtime_locus: 'pc-site',
      handle: 'hwnd:456',
      transport: 'operator_surface_input',
      submit_strategy: 'known_surface_submit',
      input_capabilities: ['type_text', 'submit'],
      status: 'active',
    }]);
    await writeRoster(cwd, [{
      agent_id: 'narada-andrey.Bob',
      role: 'builder',
      capabilities: [],
      first_seen_at: '2026-04-30T16:00:00.000Z',
      last_active_at: '2026-04-30T16:00:00.000Z',
      status: 'idle',
      task: null,
    }]);

    const result = await operatorSurfaceSendCommand({
      cwd,
      from: 'narada-proper.builder',
      to: 'narada-andrey.builder',
      currentSite: 'narada-proper',
      text: 'next',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      requested_address: 'narada-andrey.builder',
      current_site: 'narada-proper',
      target_site: 'narada-andrey',
      requested_agent: 'narada-andrey.builder',
      resolved_agent: 'narada-andrey.Bob',
      message_route: {
        sender: 'narada-proper.builder',
        requested_recipient: 'narada-andrey.builder',
        resolved_recipient: 'narada-andrey.Bob',
        current_site: 'narada-proper',
        target_site: 'narada-andrey',
        binding_status: 'bound',
      },
      agent_address_resolution: {
        status: 'role_exact_one',
        candidates: ['narada-andrey.Bob'],
      },
      identity_resolution: {
        requested_identity: 'narada-andrey.Bob',
        resolved_identity: 'narada-andrey.Bob',
        resolution: 'identity_id',
      },
      send: {
        identity: 'narada-andrey.Bob',
        requested_agent: 'narada-andrey.builder',
        resolved_agent: 'narada-andrey.Bob',
        sender: 'narada-proper.builder',
        recipient: 'narada-andrey.Bob',
        requested_address: 'narada-andrey.builder',
        target_site: 'narada-andrey',
        runtime_locus: 'pc-site',
      },
    });
  });

  it('fails operator-surface send closed when site-qualified role address has multiple active agents', async () => {
    const cwd = await tempRepo();
    await writeRoster(cwd, [
      {
        agent_id: 'narada-andrey.Bob',
        role: 'builder',
        capabilities: [],
        first_seen_at: '2026-04-30T16:00:00.000Z',
        last_active_at: '2026-04-30T16:00:00.000Z',
        status: 'idle',
        task: null,
      },
      {
        agent_id: 'narada-andrey.Alice',
        role: 'builder',
        capabilities: [],
        first_seen_at: '2026-04-30T16:00:00.000Z',
        last_active_at: '2026-04-30T16:00:00.000Z',
        status: 'working',
        task: 1135,
      },
    ]);

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-andrey.builder',
      text: 'next',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'agent_address_ambiguous',
      requested_agent: 'narada-andrey.builder',
      resolved_agent: null,
      agent_address_resolution: {
        status: 'multi_match',
        candidates: ['narada-andrey.Alice', 'narada-andrey.Bob'],
      },
      unblock_command: 'Use one concrete agent id: narada-andrey.Alice, narada-andrey.Bob',
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
      requested_address: 'narada-proper-builder',
      current_site: 'narada-proper',
      target_site: 'narada-proper',
      message_route: {
        binding_status: 'unbound',
      },
      handoff: {
        status: 'discovery_required',
        command: null,
        discovery_commands: [
          'narada sites list --format json',
          'narada operator-surface status --format json',
          'narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus <runtime-locus-from-status>',
        ],
      },
      unblock_command: 'narada sites list --format json && narada operator-surface status --format json && narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus <runtime-locus-from-status>',
    });
  });

  it('reconciles visible label evidence with missing addressable runtime binding', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeVisibleLabels(cwd, [{
      identity_id: 'narada-proper-builder',
      site_id: 'narada-proper',
      role: 'builder',
      label: 'narada.builder',
      runtime_locus: 'pc-site',
      source: 'window-title',
      observed_at: '2026-04-30T16:00:00.000Z',
      status: 'visible',
    }]);
    mkdirSync(join(cwd, '.ai', 'agents'), { recursive: true });
    await writeFile(join(cwd, '.ai', 'agents', 'roster.json'), JSON.stringify({
      version: 2,
      updated_at: '2026-04-30T16:00:00.000Z',
      agents: [{
        agent_id: 'builder',
        role: 'builder',
        capabilities: [],
        first_seen_at: '2026-04-30T16:00:00.000Z',
        last_active_at: '2026-04-30T16:00:00.000Z',
        status: 'working',
        task: 1134,
      }],
    }, null, 2));

    const status = await operatorSurfaceStatusCommand({
      cwd,
      site: 'narada-proper',
      format: 'json',
    }, createMockContext());

    expect(status.exitCode).toBe(ExitCode.SUCCESS);
    const agent = (status.result as { agents: Array<Record<string, unknown>> }).agents.find((entry) => entry.identity_id === 'narada-proper-builder');
    expect(agent).toMatchObject({
      identity_id: 'narada-proper-builder',
      role: 'builder',
      work_status: 'working',
      current_task: 1134,
      binding_status: 'labeled_unbound',
      addressability_status: 'labeled_unbound',
      label_evidence_status: 'visible_label_without_binding',
      visible_label: {
        label: 'narada.builder',
        runtime_locus: 'pc-site',
      },
      reconciliation_command: 'narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus pc-site',
    });

    const send = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'next',
      format: 'json',
    }, createMockContext());

    expect(send.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(send.result).toMatchObject({
      reason: 'no_binding',
      requested_address: 'narada-proper-builder',
      current_site: 'narada-proper',
      target_site: 'narada-proper',
      message_route: {
        binding_status: 'labeled_unbound',
      },
      label_evidence_status: 'visible_label_without_binding',
      visible_label: {
        label: 'narada.builder',
        runtime_locus: 'pc-site',
      },
      explanation: expect.stringContaining('visible title/label'),
      unblock_command: 'narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus pc-site',
      reconciliation_command: 'narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus pc-site',
    });
  });

  it('resolves observer alias before reporting missing runtime binding', async () => {
    const cwd = await tempRepo();
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-observer',
      role: 'observer',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'observer',
      text: 'Please observe coherence only.',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'no_binding',
      identity: 'narada-proper-observer',
      requested_address: 'observer',
      current_site: 'narada-proper',
      target_site: 'narada-proper',
      identity_resolution: {
        requested_identity: 'observer',
        resolved_identity: 'narada-proper-observer',
        resolution: 'alias',
        matched_alias: 'observer',
      },
      unblock_command: 'narada sites list --format json && narada operator-surface status --format json && narada operator-surface bind-focused --identity narada-proper-observer --runtime-locus <runtime-locus-from-status>',
    });
  });

  it('lists admitted observer aliases when send identity is unknown', async () => {
    const cwd = await tempRepo();
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-observer',
      role: 'observer',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'coherence-watcher',
      text: 'Observe only.',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'identity_not_admitted',
      identity: 'coherence-watcher',
      available_aliases: expect.arrayContaining(['observer', 'narada observer', 'narada-proper-observer']),
      unblock_command: 'narada operator-surface agent instantiate --site <site-id-or-root> --role <role> --agent-kind codex_cli --by <principal> --identity coherence-watcher',
    });
  });

  it('requires Site plane before giving observer admission repair for bare role recipient', async () => {
    const cwd = await tempRepo();

    const missingSite = await operatorSurfaceSendCommand({
      cwd,
      to: 'observer',
      text: 'Observe only.',
      format: 'json',
    }, createMockContext());

    expect(missingSite.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(missingSite.result).toMatchObject({
      status: 'error',
      reason: 'current_site_required_for_bare_role',
      requested_address: 'observer',
    });

    const result = await operatorSurfaceSendCommand({
      cwd,
      to: 'observer',
      currentSite: 'narada-proper',
      text: 'Observe only.',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'identity_not_admitted',
      identity: 'observer',
      requested_address: 'observer',
      current_site: 'narada-proper',
      target_site: 'narada-proper',
      unblock_command: 'narada operator-surface agent instantiate --site <site-id-or-root> --role observer --agent-kind codex_cli --by <principal>',
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

  it('allows microphone-only voice capture without remote transcription capability', async () => {
    const cwd = await tempRepo();
    const result = await operatorSurfaceVoiceTranscriptionCheckCommand({
      cwd,
      site: 'narada-proper',
      principal: 'operator',
      micOnly: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      mode: 'mic_only',
      remote_transcription_admissible: false,
      remote_audio_will_be_sent: false,
      capability: { required: false },
      raw_secret_exposed: false,
    });
  });

  it('requires active capability consent before remote voice transcription', async () => {
    const cwd = await tempRepo();
    const result = await operatorSurfaceVoiceTranscriptionCheckCommand({
      cwd,
      site: 'narada-proper',
      principal: 'operator',
      credentialRef: 'env:HARMONIA_VOICE_TRANSCRIPTION_TOKEN',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'missing_capability_consent',
      remote_transcription_admissible: false,
      remote_audio_will_be_sent: false,
      capability: {
        required: true,
        kind: 'voice.transcription.remote',
        action: 'remote_audio_transcribe',
      },
      credential: {
        credential_ref: 'env:HARMONIA_VOICE_TRANSCRIPTION_TOKEN',
        credential_ref_kind: 'env',
        raw_secret_exposed: false,
      },
      raw_secret_exposed: false,
    });
  });

  it('checks env credential material without exposing raw voice transcription token', async () => {
    const cwd = await tempRepo();
    const original = process.env.HARMONIA_VOICE_TRANSCRIPTION_TOKEN;
    process.env.HARMONIA_VOICE_TRANSCRIPTION_TOKEN = 'voice-secret-token';
    try {
      const grantResult = await capabilityGrantCommand({
        cwd,
        site: 'narada-proper',
        principal: 'operator',
        kind: 'voice.transcription.remote',
        allow: 'remote_audio_transcribe',
        credentialRef: 'env:HARMONIA_VOICE_TRANSCRIPTION_TOKEN',
        by: 'operator',
        format: 'json',
      }, createMockContext());
      const grantId = (grantResult.result as { grant: { grant_id: string } }).grant.grant_id;

      const result = await operatorSurfaceVoiceTranscriptionCheckCommand({
        cwd,
        site: 'narada-proper',
        principal: 'operator',
        capabilityGrantId: grantId,
        format: 'json',
      }, createMockContext());

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(JSON.stringify(result.result)).not.toContain('voice-secret-token');
      expect(result.result).toMatchObject({
        status: 'success',
        remote_transcription_admissible: true,
        remote_audio_will_be_sent: false,
        transcription_credential_available: true,
        credential: {
          credential_ref: 'env:HARMONIA_VOICE_TRANSCRIPTION_TOKEN',
          credential_ref_kind: 'env',
          local_secret_material_status: 'present',
          raw_secret_exposed: false,
        },
      });
    } finally {
      if (original === undefined) delete process.env.HARMONIA_VOICE_TRANSCRIPTION_TOKEN;
      else process.env.HARMONIA_VOICE_TRANSCRIPTION_TOKEN = original;
    }
  });

  it('documents Windows Credential Manager voice credential resolution as Site-local', async () => {
    const cwd = await tempRepo();
    const grantResult = await capabilityGrantCommand({
      cwd,
      site: 'narada-proper',
      principal: 'operator',
      kind: 'voice.transcription.remote',
      allow: 'remote_audio_transcribe',
      credentialRef: 'credential-manager:Narada/HarmoniaVoiceTranscription',
      by: 'operator',
      format: 'json',
    }, createMockContext());
    const grantId = (grantResult.result as { grant: { grant_id: string } }).grant.grant_id;

    const result = await operatorSurfaceVoiceTranscriptionCheckCommand({
      cwd,
      site: 'narada-proper',
      principal: 'operator',
      capabilityGrantId: grantId,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      remote_transcription_admissible: true,
      credential: {
        credential_ref_kind: 'windows_credential_manager',
        local_secret_material_status: 'site_local_extension_required',
        raw_secret_exposed: false,
        repair: expect.stringContaining('owning Windows Site adapter'),
      },
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

  it('joins operator-surface identity, binding, roster, and work status', async () => {
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
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-architect',
      role: 'architect',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      by: 'operator',
      format: 'json',
    }, createMockContext());
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-observer',
      role: 'observer',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      by: 'operator',
      format: 'json',
    }, createMockContext());
    await writeBindings(cwd, [
      {
        binding_id: 'builder-binding',
        identity_id: 'narada-proper-builder',
        runtime_locus: 'pc-site',
        handle: 'hwnd:builder',
        input_capabilities: ['type_text'],
        status: 'active',
      },
      {
        binding_id: 'architect-binding',
        identity_id: 'narada-proper-architect',
        runtime_locus: 'pc-site',
        handle: 'hwnd:architect',
        input_capabilities: ['type_text'],
        stale_after: '2000-01-01T00:00:00Z',
        status: 'active',
      },
    ]);
    mkdirSync(join(cwd, '.ai', 'agents'), { recursive: true });
    await writeFile(join(cwd, '.ai', 'agents', 'roster.json'), JSON.stringify({
      version: 2,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        {
          agent_id: 'builder',
          role: 'builder',
          capabilities: [],
          first_seen_at: '2026-01-01T00:00:00Z',
          last_active_at: '2026-01-01T00:00:00Z',
          status: 'working',
          task: 1122,
        },
        {
          agent_id: 'architect',
          role: 'architect',
          capabilities: [],
          first_seen_at: '2026-01-01T00:00:00Z',
          last_active_at: '2026-01-02T00:00:00Z',
          status: 'idle',
          task: null,
        },
      ],
    }, null, 2));

    const result = await operatorSurfaceStatusCommand({
      cwd,
      site: 'narada-proper',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      mutation_performed: false,
      count: 3,
      agents: expect.arrayContaining([
        expect.objectContaining({
          identity_id: 'narada-proper-builder',
          role: 'builder',
          runtime_locus: 'pc-site',
          binding_status: 'bound',
          addressability_status: 'reachable',
          work_status: 'working',
          current_task: 1122,
          next_command: 'narada task continue 1122 --agent builder',
        }),
        expect.objectContaining({
          identity_id: 'narada-proper-architect',
          role: 'architect',
          runtime_locus: 'pc-site',
          binding_status: 'stale',
          addressability_status: 'stale',
          work_status: 'idle',
          current_task: null,
          last_activity_at: '2026-01-02T00:00:00Z',
          next_command: 'narada operator-surface bind-focused --identity narada-proper-architect --runtime-locus pc-site',
        }),
        expect.objectContaining({
          identity_id: 'narada-proper-observer',
          role: 'observer',
          runtime_locus: null,
          binding_status: 'unbound',
          addressability_status: 'unbound',
          work_status: 'untracked',
          current_task: null,
          next_command: 'narada sites list --format json && narada operator-surface status --format json && narada operator-surface bind-focused --identity narada-proper-observer --runtime-locus <runtime-locus-from-status>',
        }),
      ]),
    });
    expect((result.result as { human: string[] }).human.join('\n')).toContain('observer: untracked');
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
      authority_split: {
        durable_identity_authority: expect.stringContaining('operator-surfaces/identities.json'),
        volatile_handle_authority: 'owning_runtime_locus_required',
      },
      handoff: {
        status: 'discovery_required',
        command: null,
        discovery_commands: [
          'narada sites list --format json',
          'narada operator-surface status --format json',
          'narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus <runtime-locus-from-status>',
        ],
      },
      deferred_command: 'narada sites list --format json && narada operator-surface status --format json && narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus <runtime-locus-from-status>',
    });
  });

  it('admits runtime binding when bind-focused receives a runtime locus and observed handle', async () => {
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

    const result = await operatorSurfaceBindFocusedCommand({
      cwd,
      identity: 'narada-proper-builder',
      runtimeLocus: 'pc-site',
      handle: 'codex-thread:test-thread',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      reason: 'runtime_binding_admitted',
      mutation_performed: true,
      runtime_binding_mutated: true,
      authority_split: {
        volatile_handle_authority: 'pc-site',
      },
      binding: {
        identity_id: 'narada-proper-builder',
        runtime_locus: 'pc-site',
        handle: 'codex-thread:test-thread',
        transport: 'explicit_runtime_handle',
        status: 'active',
      },
    });
    const bindings = JSON.parse(await readFile(join(cwd, 'operator-surfaces', 'runtime-bindings.json'), 'utf8')) as { bindings: Array<Record<string, unknown>> };
    expect(bindings.bindings).toEqual([
      expect.objectContaining({
        identity_id: 'narada-proper-builder',
        runtime_locus: 'pc-site',
        handle: 'codex-thread:test-thread',
      }),
    ]);
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
