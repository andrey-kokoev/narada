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
  operatorSurfaceAgentForkCommand,
  operatorSurfaceBindingDeferredCommand,
  operatorSurfaceBindFocusedCommand,
  operatorSurfaceDoctorCommand,
  operatorSurfaceIdentityAdmitTaskAuthorityCommand,
  operatorSurfaceIdentityAddCommand,
  operatorSurfaceIdentityRenameCommand,
  operatorSurfaceInspectCompactCommand,
  operatorSurfaceLabelsBuildCommand,
  operatorSurfaceSendCommand,
  operatorSurfaceStatusCommand,
  operatorSurfaceVoiceTranscriptionCheckCommand,
} from '../../src/commands/operator-surface.js';
import { capabilityGrantCommand } from '../../src/commands/capability.js';
import { loadRoster, saveRoster } from '../../src/lib/task-governance.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { resolveAgentAddress } from '../../src/lib/agent-address.js';
import { SqliteInboxStore } from '@narada2/control-plane';

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
  mkdirSync(join(cwd, 'operator-surfaces'), { recursive: true });
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
  delete process.env.NARADA_OPERATOR_SURFACE_IDENTITY;
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
      readiness: {
        alias: {
          status: 'ready',
          aliases: expect.arrayContaining(['narada-proper.builder', 'narada-proper-builder']),
        },
        task_roster: {
          status: 'created',
          mutation_performed: true,
          agent_id: 'narada-proper-builder',
          role_address_command: 'narada task work-next --agent narada-proper.builder',
        },
        label: {
          status: 'ready',
          expected_identity_name: 'narada-proper-builder',
        },
      },
      role_contract: {
        duties: expect.arrayContaining([expect.stringContaining('Execute approved local work packages')]),
        boundaries: expect.arrayContaining([expect.stringContaining('`next` means run this role normal duty loop')]),
      },
    });
    const roster = await loadRoster(cwd);
    expect(roster.agents.find((agent) => agent.agent_id === 'narada-proper-builder')).toMatchObject({
      role: 'builder',
      status: 'idle',
      capabilities: ['execute', 'test', 'report'],
    });
    expect(resolveAgentAddress(roster, 'narada-proper.builder')).toMatchObject({
      status: 'role_exact_one',
      resolved_agent: 'narada-proper-builder',
    });
    expect((result.result as { copyable_text: string }).copyable_text).toContain('When Operator says `next`, run the normal duty loop for this role.');
  });

  it('prepares a task-backed operator-surface agent fork with durable handoff and adoption evidence', async () => {
    const cwd = await tempRepo();
    mkdirSync(join(cwd, '.ai', 'do-not-open', 'tasks'), { recursive: true });
    await writeFile(
      join(cwd, '.ai', 'do-not-open', 'tasks', '20260430-42-build-widget.md'),
      '---\nstatus: opened\n---\n\n# Build Widget\n\n## Acceptance Criteria\n- [ ] Widget built.\n',
    );

    const result = await operatorSurfaceAgentForkCommand({
      cwd,
      site: 'narada-cpy',
      role: 'builder',
      agentKind: 'codex_cli',
      identityName: 'narada-cpy.builder',
      taskNumber: '42',
      runtimeLocus: 'pc-site',
      by: 'architect',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action: 'operator_surface_agent_fork',
      execution_status: 'dry_run_prepared',
      process_launch_performed: false,
      prompt: expect.stringContaining('Current task: 42 - Build Widget'),
      identity_readiness: {
        readiness: {
          task_roster: {
            status: 'created',
            agent_id: 'narada-cpy.builder',
          },
        },
      },
    });
    const data = result.result as { handoff_artifact: string; adoption_artifact: string };
    expect(existsSync(data.handoff_artifact)).toBe(true);
    expect(existsSync(data.adoption_artifact)).toBe(true);
    const handoff = JSON.parse(await readFile(data.handoff_artifact, 'utf8')) as Record<string, unknown>;
    expect(handoff).toMatchObject({
      evidence_kind: 'fork_handoff',
      identity_id: 'narada-cpy.builder',
      task_context: {
        task_number: 42,
        title: 'Build Widget',
      },
      dry_run_default: true,
      exec_requested: false,
    });
  });

  it('admits a CPY-style builder as message-addressable and task-roster-ready without manual JSON edits', async () => {
    const cwd = await tempRepo();
    const result = await operatorSurfaceAgentInstantiateCommand({
      cwd,
      site: 'narada-cpy',
      role: 'builder',
      agentKind: 'codex_cli',
      by: 'operator',
      identityName: 'narada-cpy.builder',
      inputCapabilities: 'type_text,submit',
      submitStrategy: 'known_surface_submit',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      identity_id: 'narada-cpy.builder',
      readiness: {
        alias: {
          status: 'ready',
          role_address: 'narada-cpy.builder',
          aliases: expect.arrayContaining(['narada-cpy.builder', 'builder']),
        },
        submit_strategy: {
          status: 'ready',
          submit_strategy: 'known_surface_submit',
        },
        binding: {
          status: 'deferred',
          repair_command: expect.stringContaining('narada operator-surface bind-focused --identity narada-cpy.builder --runtime-locus <runtime-locus-from-status> --handle <captured-hwnd-or-stable-handle>'),
        },
        label: {
          status: 'ready',
          expected_identity_id: 'narada-cpy.builder',
          expected_identity_name: 'narada-cpy.builder',
        },
        task_roster: {
          status: 'created',
          agent_id: 'narada-cpy.builder',
          command: 'narada task work-next --agent narada-cpy.builder',
        },
      },
    });

    const send = await operatorSurfaceSendCommand({
      cwd,
      from: 'operator',
      to: 'narada-cpy.builder',
      text: 'next',
      dryRun: true,
      format: 'json',
    }, createMockContext());
    expect(send.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(send.result).toMatchObject({
      reason: 'no_binding',
      identity: 'narada-cpy.builder',
      message_route: {
        resolved_recipient: 'narada-cpy.builder',
      },
      unblock_command: expect.stringContaining('bind-focused --identity narada-cpy.builder'),
    });

    const roster = await loadRoster(cwd);
    expect(resolveAgentAddress(roster, 'narada-cpy.builder')).toMatchObject({
      status: 'exact',
      resolved_agent: 'narada-cpy.builder',
    });
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

  it('rejects identity rename when the old identity Site is not registered as canonical', async () => {
    const cwd = await tempRepo();
    mkdirSync(join(cwd, 'operator-surfaces'), { recursive: true });
    await writeFile(join(cwd, 'operator-surfaces', 'identities.json'), JSON.stringify({
      schema: 'https://narada.dev/schemas/operator-surface-identities/v1',
      updated_at: '2026-04-30T00:00:00.000Z',
      sites: {
        'narada-andrey': {},
      },
      identities: [{
        identity_id: 'andrey-user.architect',
        site_id: 'andrey-user',
        role: 'architect',
        agent_kind: 'codex_cli',
        label: 'Architect',
        admitted_by: 'operator',
        admitted_at: '2026-04-30T00:00:00.000Z',
        updated_at: '2026-04-30T00:00:00.000Z',
        authority_limits: [],
      }],
    }, null, 2));

    const result = await operatorSurfaceIdentityRenameCommand({
      cwd,
      fromIdentity: 'andrey-user.architect',
      toIdentity: 'andrey-user.Kevin',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'site_identity_unregistered',
      mutation_performed: false,
      old_site_id: 'andrey-user',
      registered_site_ids: ['narada-andrey'],
      canonical_site_id: 'narada-andrey',
      unblock_command: expect.stringContaining('Reconcile operator-surface identity Site ids before rename'),
    });
  });

  it('accepts identity rename under the registered canonical Site id', async () => {
    const cwd = await tempRepo();
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-andrey.architect',
      role: 'architect',
      agentKind: 'codex_cli',
      site: 'narada-andrey',
      siteAffinityColor: '#123456',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    const result = await operatorSurfaceIdentityRenameCommand({
      cwd,
      fromIdentity: 'narada-andrey.architect',
      toIdentity: 'narada-andrey.Kevin',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      mutation_performed: true,
      new_identity_id: 'narada-andrey.Kevin',
      site_id: 'narada-andrey',
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

  it('admits a renamed operator-surface identity into task authority without collapsing role aliases', async () => {
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
    await operatorSurfaceIdentityRenameCommand({
      cwd,
      fromIdentity: 'narada-andrey.architect',
      toIdentity: 'narada-andrey.Kevin',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    const result = await operatorSurfaceIdentityAdmitTaskAuthorityCommand({
      cwd,
      identityName: 'narada-andrey.Kevin',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      identity_id: 'narada-andrey.Kevin',
      role: 'architect',
      capabilities: expect.arrayContaining(['review', 'architect_as_reviewer']),
      exact_identity_preserved: true,
      role_aliases_not_collapsed: true,
    });
    const roster = await loadRoster(cwd);
    expect(roster.agents.find((agent) => agent.agent_id === 'narada-andrey.Kevin')).toMatchObject({
      role: 'architect',
      capabilities: expect.arrayContaining(['review']),
    });
    expect(roster.agents.find((agent) => agent.agent_id === 'narada-andrey.architect')).toBeUndefined();
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
          command: 'narada operator-surface bind-focused --identity narada-proper-architect --runtime-locus pc-site --handle <captured-hwnd-or-stable-handle>',
        },
        deferred_command: 'narada operator-surface bind-focused --identity narada-proper-architect --runtime-locus pc-site --handle <captured-hwnd-or-stable-handle>',
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

  it('returns compact schema-stable operator surface inspection for Architect loops', async () => {
    const cwd = await tempRepo();
    const add = await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-builder',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      label: 'Narada Proper Builder',
      inputCapabilities: 'type_text,submit',
      submitStrategy: 'known_surface_submit',
      by: 'operator',
      format: 'json',
    }, createMockContext());
    expect(add.exitCode).toBe(ExitCode.SUCCESS);
    mkdirSync(join(cwd, 'operator-surfaces'), { recursive: true });
    await writeFile(join(cwd, 'operator-surfaces', 'visible-labels.json'), JSON.stringify({
      labels: [{
        identity_id: 'narada-proper-builder',
        site_id: 'narada-proper',
        role: 'builder',
        label: 'Narada Proper Builder',
        runtime_locus: 'pc-site',
        status: 'visible',
      }],
    }, null, 2));
    await writeFile(join(cwd, 'operator-surfaces', 'runtime-bindings.json'), JSON.stringify({
      bindings: [{
        binding_id: 'bind-1',
        identity_id: 'narada-proper-builder',
        runtime_locus: 'pc-site',
        handle: 'hwnd:123',
        transport: 'windows-terminal',
        input_capabilities: ['type_text', 'submit'],
        submit_strategy: 'known_surface_submit',
        status: 'active',
      }],
    }, null, 2));

    const inspect = await operatorSurfaceInspectCompactCommand({
      cwd,
      site: 'narada-proper',
      format: 'json',
    }, createMockContext());

    expect(inspect.exitCode).toBe(ExitCode.SUCCESS);
    expect(inspect.result).toMatchObject({
      status: 'success',
      schema: 'https://narada.dev/schemas/operator-surface-compact-inspect/v1',
      count: 1,
      projection_boundary: {
        visible_labels_are_carrier_evidence: true,
      },
      rows: [{
        identity_id: 'narada-proper-builder',
        identity_name: 'narada-proper-builder',
        role: 'builder',
        runtime_locus: 'pc-site',
        binding_status: 'bound',
        addressability_status: 'reachable',
        visible_label_status: 'none',
      }],
      architect_loop_guidance: expect.stringContaining('compact schema'),
    });
  });

  it('fails compact inspection once when visible label evidence has an unknown schema', async () => {
    const cwd = await tempRepo();
    const add = await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-builder',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      by: 'operator',
      format: 'json',
    }, createMockContext());
    expect(add.exitCode).toBe(ExitCode.SUCCESS);
    mkdirSync(join(cwd, 'operator-surfaces'), { recursive: true });
    await writeFile(join(cwd, 'operator-surfaces', 'visible-labels.json'), JSON.stringify({
      windows: [{ title: 'narada.builder' }],
    }, null, 2));

    const inspect = await operatorSurfaceInspectCompactCommand({
      cwd,
      site: 'narada-proper',
      format: 'json',
    }, createMockContext());

    expect(inspect.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(inspect.result).toMatchObject({
      status: 'error',
      mutation_performed: false,
      reason: 'operator_surface_visible_labels_schema_mismatch',
      expected_schema: {
        labels: [expect.objectContaining({
          identity_id: 'string optional',
        })],
      },
      repair_guidance: expect.stringContaining('do not Select-Object a guessed labels property'),
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
        label_projection: {
          style: {
            value: '#c45a14',
            source: 'role_metadata',
            authority: 'ergonomic_projection_hint',
          },
          diagnostic: null,
          authority_boundary: expect.stringContaining('ergonomic projection metadata only'),
        },
      }],
      diagnostics: [],
    });
  });

  it('preserves architect role color across named-agent identity migration', async () => {
    const cwd = await tempRepo();
    mkdirSync(join(cwd, 'operator-surfaces'), { recursive: true });
    await writeFile(join(cwd, 'operator-surfaces', 'identities.json'), JSON.stringify({
      schema: 'https://narada.dev/schemas/operator-surface-identities/v1',
      updated_at: '2026-05-01T00:00:00Z',
      roles: {
        architect: { affinity_color: '#ff3fb7' },
      },
      identities: [{
        identity_id: 'narada-andrey.Kevin',
        previous_identity_ids: ['narada-andrey.architect'],
        site_id: 'narada-andrey',
        role: 'architect',
        agent_kind: 'codex_cli',
        label: 'Kevin',
        admitted_by: 'operator',
        admitted_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
        authority_limits: [],
      }],
    }, null, 2));

    const labels = await operatorSurfaceLabelsBuildCommand({
      cwd,
      site: 'narada-andrey',
      format: 'json',
    }, createMockContext());

    expect(labels.exitCode).toBe(ExitCode.SUCCESS);
    expect(labels.result).toMatchObject({
      diagnostics: [],
      labels: [{
        identity_id: 'narada-andrey.Kevin',
        role: 'architect',
        projection_hints: {
          role_line: {
            affinity_color: {
              value: '#ff3fb7',
              source: 'role_metadata',
            },
          },
        },
        label_projection: {
          style: {
            value: '#ff3fb7',
            source: 'role_metadata',
            authority: 'ergonomic_projection_hint',
          },
          diagnostic: null,
        },
      }],
    });
  });

  it('diagnoses default label style fallback without making projection authoritative', async () => {
    const cwd = await tempRepo();
    mkdirSync(join(cwd, 'operator-surfaces'), { recursive: true });
    await writeFile(join(cwd, 'operator-surfaces', 'identities.json'), JSON.stringify({
      schema: 'https://narada.dev/schemas/operator-surface-identities/v1',
      updated_at: '2026-05-01T00:00:00Z',
      identities: [{
        identity_id: 'narada-proper-reviewer',
        site_id: 'narada-proper',
        role: 'reviewer',
        agent_kind: 'codex_cli',
        label: 'Reviewer',
        admitted_by: 'operator',
        admitted_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
        authority_limits: [],
      }],
    }, null, 2));

    const labels = await operatorSurfaceLabelsBuildCommand({
      cwd,
      site: 'narada-proper',
      format: 'json',
    }, createMockContext());

    expect(labels.exitCode).toBe(ExitCode.SUCCESS);
    expect(labels.result).toMatchObject({
      diagnostics: [{
        code: 'operator_surface_label_style_defaulted',
        identity_id: 'narada-proper-reviewer',
        role: 'reviewer',
        reason: expect.stringContaining('no explicit identity label_projection.style'),
      }],
      labels: [{
        label_projection: {
          style: {
            value: '#6b7280',
            source: 'declared_default',
            authority: 'ergonomic_projection_hint',
          },
          diagnostic: {
            code: 'operator_surface_label_style_defaulted',
          },
          authority_boundary: expect.stringContaining('does not admit identity, role, capability, or runtime binding authority'),
        },
      }],
    });
  });

  it('prefers explicit identity label style over inherited role color', async () => {
    const cwd = await tempRepo();
    mkdirSync(join(cwd, 'operator-surfaces'), { recursive: true });
    await writeFile(join(cwd, 'operator-surfaces', 'identities.json'), JSON.stringify({
      schema: 'https://narada.dev/schemas/operator-surface-identities/v1',
      updated_at: '2026-05-01T00:00:00Z',
      roles: {
        architect: { affinity_color: '#ff3fb7' },
      },
      identities: [{
        identity_id: 'narada-andrey.Kevin',
        site_id: 'narada-andrey',
        role: 'architect',
        agent_kind: 'codex_cli',
        label: 'Kevin',
        label_projection: { style: { affinity_color: '#00aaee' } },
        admitted_by: 'operator',
        admitted_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
        authority_limits: [],
      }],
    }, null, 2));

    const labels = await operatorSurfaceLabelsBuildCommand({
      cwd,
      site: 'narada-andrey',
      format: 'json',
    }, createMockContext());

    expect(labels.exitCode).toBe(ExitCode.SUCCESS);
    expect(labels.result).toMatchObject({
      diagnostics: [],
      labels: [{
        label_projection: {
          style: {
            value: '#00aaee',
            source: 'projection_override',
          },
          diagnostic: null,
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
      current_site: 'narada',
      target_site: 'narada',
      message_route: {
        sender: 'operator',
        requested_recipient: 'narada-proper-builder',
        resolved_recipient: 'narada-proper-builder',
        current_site: 'narada',
        target_site: 'narada',
        binding_status: 'bound',
        identity_flag_mode: 'deprecated_recipient_alias',
      },
      send: {
        identity: 'narada-proper-builder',
        sender: 'operator',
        recipient: 'narada-proper-builder',
        requested_address: 'narada-proper-builder',
        current_site: 'narada',
        target_site: 'narada',
        message_route: {
          sender: 'operator',
          requested_recipient: 'narada-proper-builder',
          resolved_recipient: 'narada-proper-builder',
          current_site: 'narada',
          target_site: 'narada',
          binding_status: 'bound',
        },
        site_plane: {
          current_site: 'narada',
          target_site: 'narada',
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
      current_site: 'narada',
      target_site: 'narada',
      message_route: {
        sender: 'Operator',
        requested_recipient: 'builder',
        resolved_recipient: 'narada-proper-builder',
        current_site: 'narada',
        target_site: 'narada',
        identity_flag_mode: 'explicit_to',
      },
      send: {
        identity: 'narada-proper-builder',
        sender: 'Operator',
        recipient: 'narada-proper-builder',
        requested_address: 'builder',
        site_plane: {
          current_site: 'narada',
          target_site: 'narada',
        },
      },
    });
  });

  it('routes canonical narada current-site to legacy narada-proper identities without site mismatch', async () => {
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

    const bareRole = await operatorSurfaceSendCommand({
      cwd,
      from: 'Operator',
      to: 'builder',
      currentSite: 'narada',
      text: 'next',
      dryRun: true,
      format: 'json',
    }, createMockContext());
    const scopedRole = await operatorSurfaceSendCommand({
      cwd,
      from: 'Operator',
      to: 'narada.builder',
      currentSite: 'narada',
      text: 'next',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(bareRole.exitCode).toBe(ExitCode.SUCCESS);
    expect(bareRole.result).toMatchObject({
      status: 'success',
      requested_address: 'builder',
      current_site: 'narada',
      target_site: 'narada',
      send: {
        identity: 'narada-proper-builder',
        site_plane: {
          current_site: 'narada',
          target_site: 'narada',
        },
      },
    });
    expect(scopedRole.exitCode).toBe(ExitCode.SUCCESS);
    expect(scopedRole.result).toMatchObject({
      status: 'success',
      requested_address: 'narada.builder',
      current_site: 'narada',
      target_site: 'narada',
      identity_resolution: {
        resolution: 'scoped_role_alias_exact_one',
        resolution_evidence: {
          site_id: 'narada',
          requested_site_id: 'narada',
          legacy_site_ids: ['narada-proper'],
          candidates: ['narada-proper-builder'],
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

  it('resolves site-qualified role address to exact-one admitted identity before operator-surface send', async () => {
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
      current_site: 'narada',
      target_site: 'narada-andrey',
      requested_to: 'narada-andrey.builder',
      resolved_to: 'narada-andrey.Bob',
      resolution: 'scoped_role_alias_exact_one',
      message_route: {
        sender: 'narada-proper.builder',
        requested_recipient: 'narada-andrey.builder',
        resolved_recipient: 'narada-andrey.Bob',
        requested_to: 'narada-andrey.builder',
        resolved_to: 'narada-andrey.Bob',
        resolution: 'scoped_role_alias_exact_one',
        current_site: 'narada',
        target_site: 'narada-andrey',
        binding_status: 'bound',
      },
      identity_resolution: {
        requested_identity: 'narada-andrey.builder',
        resolved_identity: 'narada-andrey.Bob',
        resolution: 'scoped_role_alias_exact_one',
        resolution_evidence: {
          site_id: 'narada-andrey',
          role: 'builder',
          candidates: ['narada-andrey.Bob'],
        },
      },
      send: {
        identity: 'narada-andrey.Bob',
        sender: 'narada-proper.builder',
        recipient: 'narada-andrey.Bob',
        requested_address: 'narada-andrey.builder',
        requested_to: 'narada-andrey.builder',
        resolved_to: 'narada-andrey.Bob',
        resolution: 'scoped_role_alias_exact_one',
        target_site: 'narada-andrey',
        runtime_locus: 'pc-site',
      },
    });
  });

  it('keeps exact identity address out of role-alias matching', async () => {
    const cwd = await tempRepo();
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-andrey.builder',
      role: 'observer',
      agentKind: 'codex_cli',
      site: 'narada-andrey',
      by: 'operator',
      inputCapabilities: 'type_text',
      format: 'json',
    }, createMockContext());
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-andrey.Alice',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-andrey',
      by: 'operator',
      inputCapabilities: 'type_text',
      format: 'json',
    }, createMockContext());
    await writeBindings(cwd, [{
      binding_id: 'bind-exact',
      identity_id: 'narada-andrey.builder',
      runtime_locus: 'pc-site',
      handle: 'hwnd:exact',
      transport: 'operator_surface_input',
      input_capabilities: ['type_text'],
      status: 'active',
    }]);

    const result = await operatorSurfaceSendCommand({
      cwd,
      to: 'narada-andrey.builder',
      text: 'exact',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      identity_resolution: {
        requested_identity: 'narada-andrey.builder',
        resolved_identity: 'narada-andrey.builder',
        resolution: 'identity_id',
      },
      send: {
        identity: 'narada-andrey.builder',
        recipient: 'narada-andrey.builder',
      },
    });
  });

  it('fails operator-surface send closed when scoped role address has multiple admitted identities', async () => {
    const cwd = await tempRepo();
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-andrey.Bob',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-andrey',
      by: 'operator',
      format: 'json',
    }, createMockContext());
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-andrey.Alice',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-andrey',
      by: 'operator',
      format: 'json',
    }, createMockContext());

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
      reason: 'scoped_role_alias_ambiguous',
      requested_to: 'narada-andrey.builder',
      resolved_to: null,
      identity_resolution: {
        resolution: 'scoped_role_alias_multi_match',
        resolution_evidence: {
          candidates: ['narada-andrey.Alice', 'narada-andrey.Bob'],
        },
      },
      unblock_command: 'Use one concrete identity_id: narada-andrey.Alice, narada-andrey.Bob',
    });
  });

  it('fails operator-surface send closed when scoped role address has no admitted identity', async () => {
    const cwd = await tempRepo();

    const result = await operatorSurfaceSendCommand({
      cwd,
      to: 'narada-andrey.builder',
      text: 'next',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'scoped_role_alias_unresolved',
      requested_to: 'narada-andrey.builder',
      resolved_to: null,
      identity_resolution: {
        resolution: 'scoped_role_alias_zero_match',
        resolution_evidence: {
          site_id: 'narada-andrey',
          role: 'builder',
          candidates: [],
        },
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
      from: 'narada-proper.architect',
      text: 'continue current task',
      execute: true,
      operatorActivityState: 'idle',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = result.result as { event_artifact: string; delivery_result: { status: string }; send: { status: string; text_digest: string; text_length: number; rendered_text: string; sender_identity: string; resolved_sender_identity: string; sender_header_included: boolean; delivery_result: { status: string } } };
    expect(payload.delivery_result.status).toBe('delivered');
    expect(payload.send).toMatchObject({
      status: 'event_recorded_for_runtime_locus',
      delivery_result: { status: 'delivered' },
      sender_identity: 'narada-proper.architect',
      resolved_sender_identity: 'narada-proper.architect',
      sender_header_included: true,
      rendered_text: 'From: narada-proper.architect\n\ncontinue current task',
      text_length: 'From: narada-proper.architect\n\ncontinue current task'.length,
    });
    expect(payload.send.text_digest).toHaveLength(64);
    expect(payload.event_artifact).toContain('.ai/operator-surface-events/ose_');
    const event = JSON.parse(await readFile(payload.event_artifact, 'utf8')) as { identity: string; text_digest: string; sender_identity: string; rendered_text: string };
    expect(event.identity).toBe('narada-proper-builder');
    expect(event.sender_identity).toBe('narada-proper.architect');
    expect(event.rendered_text).toBe(payload.send.rendered_text);
    expect(event.text_digest).toBe(payload.send.text_digest);
  });

  it('defers operator-surface send when the PC-locus critical section is active', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeBindings(cwd, [{
      binding_id: 'bind-serialized',
      identity_id: 'narada-proper-builder',
      runtime_locus: 'pc-site',
      handle: 'hwnd:123',
      transport: 'operator_surface_input',
      submit_strategy: 'operator_confirmed_submit',
      input_capabilities: ['focus', 'type_text', 'submit'],
      status: 'active',
    }]);
    mkdirSync(join(cwd, '.ai', 'operator-surface-send-queue'), { recursive: true });
    await writeFile(join(cwd, '.ai', 'operator-surface-send-queue', 'pc-site.active.json'), `${JSON.stringify({
      event_id: 'ose_active',
      target_identity: 'narada-proper-builder',
      sender_identity: 'architect',
      runtime_locus: 'pc-site',
      status: 'active',
      critical_section: 'focus_clipboard_type_submit',
      started_at: '2026-05-01T04:00:00.000Z',
      expires_at: '2099-01-01T00:00:00.000Z',
    }, null, 2)}\n`, 'utf8');

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      from: 'architect',
      text: 'serialized message',
      execute: true,
      operatorActivityState: 'idle',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = result.result as {
      mutation_performed: boolean;
      event_artifact: string;
      delivery_result: { status: string; reason: string; queue: { next_state: string; serialization: { outcome: string; active_send: { event_id: string }; queue_artifact: string } } };
      send: { status: string; serialization: { outcome: string; critical_section: string } };
    };
    expect(payload.mutation_performed).toBe(false);
    expect(payload.delivery_result).toMatchObject({
      status: 'deferred',
      reason: 'active_operator_surface_send_in_progress',
      queue: {
        next_state: 'wait_for_send_lease_release',
        serialization: {
          outcome: 'queued_behind_active_send',
          active_send: { event_id: 'ose_active' },
          critical_section: 'focus_clipboard_type_submit',
        },
      },
    });
    expect(payload.send).toMatchObject({
      status: 'deferred',
      serialization: {
        outcome: 'queued_behind_active_send',
        critical_section: 'focus_clipboard_type_submit',
      },
    });
    expect(payload.delivery_result.queue.serialization.queue_artifact).toContain('.ai/operator-surface-send-queue/osq_');
    const event = JSON.parse(await readFile(payload.event_artifact, 'utf8')) as { serialization: { outcome: string }; delivery_result: { reason: string } };
    expect(event.serialization.outcome).toBe('queued_behind_active_send');
    expect(event.delivery_result.reason).toBe('active_operator_surface_send_in_progress');
  });

  it('recovers stale operator-surface send leases before admitting a new send', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeBindings(cwd, [{
      binding_id: 'bind-stale-recovery',
      identity_id: 'narada-proper-builder',
      runtime_locus: 'pc-site',
      handle: 'hwnd:123',
      transport: 'operator_surface_input',
      submit_strategy: 'operator_confirmed_submit',
      input_capabilities: ['focus', 'type_text', 'submit'],
      status: 'active',
    }]);
    mkdirSync(join(cwd, '.ai', 'operator-surface-send-queue'), { recursive: true });
    await writeFile(join(cwd, '.ai', 'operator-surface-send-queue', 'pc-site.active.json'), `${JSON.stringify({
      event_id: 'ose_stale',
      target_identity: 'narada-proper-builder',
      sender_identity: 'architect',
      runtime_locus: 'pc-site',
      status: 'active',
      critical_section: 'focus_clipboard_type_submit',
      started_at: '2026-05-01T04:00:00.000Z',
      expires_at: '2026-05-01T04:00:01.000Z',
    }, null, 2)}\n`, 'utf8');

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      from: 'architect',
      text: 'after stale lease',
      execute: true,
      operatorActivityState: 'idle',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = result.result as {
      mutation_performed: boolean;
      event_artifact: string;
      delivery_result: { status: string };
      serialization: { outcome: string; stale_recovery: { reason: string; recovery_artifact: string }; active_send: { event_id: string } };
    };
    expect(payload.mutation_performed).toBe(true);
    expect(payload.delivery_result.status).toBe('delivered');
    expect(payload.serialization).toMatchObject({
      outcome: 'admitted',
      stale_recovery: {
        reason: 'stale_active_send_lease',
      },
    });
    expect(payload.serialization.stale_recovery.recovery_artifact).toContain('.ai/operator-surface-send-queue/osr_');
    const active = JSON.parse(await readFile(join(cwd, '.ai', 'operator-surface-send-queue', 'pc-site.active.json'), 'utf8')) as { event_id: string; status: string };
    expect(active.event_id).toBe(payload.serialization.active_send.event_id);
    expect(active.status).toBe('active');
    const event = JSON.parse(await readFile(payload.event_artifact, 'utf8')) as { serialization: { outcome: string; stale_recovery: { reason: string } } };
    expect(event.serialization.stale_recovery.reason).toBe('stale_active_send_lease');
  });

  it('suppresses typed-message sender header only in explicit raw input mode', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeBindings(cwd, [{
      binding_id: 'bind-raw',
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
      from: 'operator',
      text: '/copy',
      rawInput: true,
      execute: true,
      operatorActivityState: 'idle',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = result.result as { event_artifact: string; send: { rendered_text: string; input_posture: string; sender_header_included: boolean; sender_identity: string } };
    expect(payload.send).toMatchObject({
      input_posture: 'raw_input',
      sender_header_included: false,
      sender_identity: 'operator',
      rendered_text: '/copy',
    });
    const event = JSON.parse(await readFile(payload.event_artifact, 'utf8')) as { rendered_text: string; sender_identity: string; sender_header_included: boolean };
    expect(event.rendered_text).toBe('/copy');
    expect(event.sender_identity).toBe('operator');
    expect(event.sender_header_included).toBe(false);
  });

  it('queues operator-surface delivery instead of mutating focus while Operator is typing', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeBindings(cwd, [{
      binding_id: 'bind-active',
      identity_id: 'narada-proper-builder',
      runtime_locus: 'pc-site',
      handle: 'hwnd:123',
      transport: 'operator_surface_input',
      submit_strategy: 'operator_confirmed_submit',
      input_capabilities: ['focus', 'type_text'],
      status: 'active',
    }]);

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'interrupting message',
      execute: true,
      operatorActivityState: 'active_typing',
      operatorActivityObservedAt: '2026-05-01T04:00:00.000Z',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = result.result as { mutation_performed: boolean; event_artifact: string | null; delivery_result: { status: string; state_path: string[]; reason: string; operator_activity: { state: string }; queue: { next_state: string } | null }; send: { status: string } };
    expect(payload.mutation_performed).toBe(false);
    expect(payload.event_artifact).toContain('.ai/operator-surface-events/ose_');
    expect(payload.delivery_result).toMatchObject({
      status: 'queued_waiting_for_idle',
      state_path: ['requested', 'queued_waiting_for_idle'],
      reason: 'operator_recent_activity_detected',
      operator_activity: { state: 'active_typing' },
      queue: { next_state: 'wait_for_idle' },
    });
    expect(payload.send.status).toBe('queued_waiting_for_idle');
  });

  it('records urgent interruption authority when delivering during Operator activity', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeBindings(cwd, [{
      binding_id: 'bind-urgent',
      identity_id: 'narada-proper-builder',
      runtime_locus: 'pc-site',
      handle: 'hwnd:123',
      transport: 'operator_surface_input',
      submit_strategy: 'operator_confirmed_submit',
      input_capabilities: ['focus', 'type_text'],
      status: 'active',
    }]);

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'urgent operator-approved interruption',
      execute: true,
      operatorActivityState: 'active_pointer',
      urgentInterruptAuthority: 'operator:interrupt-approved:1175',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = result.result as { mutation_performed: boolean; event_artifact: string | null; delivery_result: { status: string; state_path: string[]; urgent_interrupt: { authorized: boolean; authority_ref: string } } };
    expect(payload.mutation_performed).toBe(true);
    expect(payload.event_artifact).toContain('.ai/operator-surface-events/ose_');
    expect(payload.delivery_result).toMatchObject({
      status: 'delivered',
      state_path: ['requested', 'explicit_interrupt', 'delivered'],
      urgent_interrupt: {
        authorized: true,
        authority_ref: 'operator:interrupt-approved:1175',
      },
    });
  });

  it('expires queued delivery and falls back to inbox as explicit non-mutation outcomes', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeBindings(cwd, [{
      binding_id: 'bind-expire',
      identity_id: 'narada-proper-builder',
      runtime_locus: 'pc-site',
      handle: 'hwnd:123',
      transport: 'operator_surface_input',
      submit_strategy: 'operator_confirmed_submit',
      input_capabilities: ['type_text'],
      status: 'active',
    }]);

    const expired = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'expire this',
      execute: true,
      operatorActivityState: 'active_typing',
      deliveryTimeoutMs: 0,
      format: 'json',
    }, createMockContext());
    const fallback = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'fallback this',
      execute: true,
      operatorActivityState: 'active_typing',
      activeDelivery: 'fallback_to_inbox',
      format: 'json',
    }, createMockContext());

    expect((expired.result as { delivery_result: { status: string; state_path: string[] }; mutation_performed: boolean; event_artifact: string | null }).delivery_result).toMatchObject({
      status: 'expired',
      state_path: ['requested', 'expired'],
    });
    expect((expired.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
    expect((expired.result as { event_artifact: string | null }).event_artifact).toContain('.ai/operator-surface-events/ose_');
    expect((fallback.result as { delivery_result: { status: string; state_path: string[] }; mutation_performed: boolean; event_artifact: string | null }).delivery_result).toMatchObject({
      status: 'fallback_to_inbox',
      state_path: ['requested', 'fallback_to_inbox'],
    });
    expect((fallback.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
    expect((fallback.result as { event_artifact: string | null }).event_artifact).toContain('.ai/operator-surface-events/ose_');
  });

  it('defers activation failures through a durable delivery promise', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeBindings(cwd, [{
      binding_id: 'bind-activation-fail',
      identity_id: 'narada-proper-builder',
      runtime_locus: 'pc-site',
      handle: 'hwnd:123',
      transport: 'operator_surface_input',
      submit_strategy: 'operator_confirmed_submit',
      input_capabilities: ['focus', 'type_text'],
      status: 'active',
    }]);

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'survive activation failure',
      execute: true,
      operatorActivityState: 'idle',
      activationResult: 'failed',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = result.result as {
      mutation_performed: boolean;
      delivery_promise_artifact: string;
      delivery_result: { status: string; state_path: string[]; reason: string; queue: { next_state: string } };
      send: { status: string; delivery_promise: { promise_id: string; artifact: string } };
    };
    expect(payload.mutation_performed).toBe(false);
    expect(payload.delivery_promise_artifact).toContain('.ai/operator-surface-delivery-queue/osdq_');
    expect(payload.delivery_result).toMatchObject({
      status: 'deferred',
      state_path: ['requested', 'deferred'],
      reason: 'activation_failed',
      queue: { next_state: 'retry_after_activation_failure' },
    });
    expect(payload.send.status).toBe('deferred');
    expect(payload.send.delivery_promise.artifact).toBe(payload.delivery_promise_artifact);
  });

  it('falls back activation failures to target identity inbox with bounded evidence', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeBindings(cwd, [{
      binding_id: 'bind-activation-fallback',
      identity_id: 'narada-proper-builder',
      runtime_locus: 'pc-site',
      handle: 'hwnd:123',
      transport: 'operator_surface_input',
      submit_strategy: 'operator_confirmed_submit',
      input_capabilities: ['focus', 'type_text'],
      status: 'active',
    }]);

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      from: 'narada-proper.architect',
      text: 'fallback after activation failure',
      execute: true,
      operatorActivityState: 'idle',
      activeDelivery: 'fallback_to_inbox',
      activationResult: 'failed',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = result.result as {
      mutation_performed: boolean;
      fallback_inbox: { envelope_id: string; target_locus: string };
      delivery_result: { status: string; state_path: string[]; reason: string };
    };
    expect(payload.mutation_performed).toBe(false);
    expect(payload.delivery_result).toMatchObject({
      status: 'failed_with_fallback',
      state_path: ['requested', 'failed_with_fallback'],
      reason: 'activation_failed',
    });
    expect(payload.fallback_inbox).toMatchObject({ target_locus: 'narada-proper-builder' });
    const inbox = new SqliteInboxStore(join(cwd, '.ai', 'inbox.db'));
    try {
      const envelope = inbox.get(payload.fallback_inbox.envelope_id);
      expect(envelope).toMatchObject({
        target_locus: 'narada-proper-builder',
        payload: {
          delivery_evidence: {
            target_identity: 'narada-proper-builder',
            sender_identity: 'narada-proper.architect',
            failure_reason: 'activation_failed',
          },
        },
      });
      expect(JSON.stringify(envelope)).not.toContain('fallback after activation failure');
    } finally {
      inbox.close();
    }
  });

  it('refuses hidden cross-desktop delivery and offers operator-confirmed switch-send-restore', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeBindings(cwd, [{
      binding_id: 'bind-desktop',
      identity_id: 'narada-proper-builder',
      runtime_locus: 'pc-site',
      handle: 'hwnd:123',
      transport: 'operator_surface_input',
      submit_strategy: 'operator_confirmed_submit',
      input_capabilities: ['focus', 'type_text'],
      desktop_id: 'desktop-target',
      status: 'active',
    }]);

    const refused = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'summon',
      execute: true,
      operatorActivityState: 'idle',
      currentDesktop: 'desktop-current',
      format: 'json',
    }, createMockContext());
    const confirmationRequired = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'summon',
      execute: true,
      operatorActivityState: 'idle',
      currentDesktop: 'desktop-current',
      crossDesktopPolicy: 'operator_confirmed_switch_send_restore',
      format: 'json',
    }, createMockContext());
    const confirmed = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      text: 'summon',
      execute: true,
      operatorActivityState: 'idle',
      currentDesktop: 'desktop-current',
      crossDesktopPolicy: 'operator_confirmed_switch_send_restore',
      crossDesktopAuthority: 'operator:cross-desktop-approved:1193',
      format: 'json',
    }, createMockContext());

    const admittedCwd = await tempRepo();
    await admitIdentity(admittedCwd);
    await writeBindings(admittedCwd, [{
      binding_id: 'bind-desktop-authorized',
      identity_id: 'narada-proper-builder',
      runtime_locus: 'pc-site',
      handle: 'hwnd:123',
      transport: 'operator_surface_input',
      submit_strategy: 'operator_confirmed_submit',
      input_capabilities: ['focus', 'type_text'],
      desktop_id: 'desktop-target',
      status: 'active',
    }]);
    const admitted = await operatorSurfaceSendCommand({
      cwd: admittedCwd,
      identity: 'narada-proper-builder',
      text: 'summon',
      execute: true,
      operatorActivityState: 'idle',
      currentDesktop: 'desktop-current',
      crossDesktopPolicy: 'allow_with_authority',
      crossDesktopAuthority: 'operator:cross-desktop-approved:1175',
      format: 'json',
    }, createMockContext());

    expect((refused.result as { delivery_result: { status: string; state_path: string[]; reason: string; delivery_case: string; safe_next_action: string; cross_desktop: Record<string, unknown> }; mutation_performed: boolean; event_artifact: string | null }).delivery_result).toMatchObject({
      status: 'refused',
      state_path: ['requested', 'refused'],
      reason: 'cross_desktop_delivery_refused_by_policy',
      delivery_case: 'cross_desktop_hidden_input_refused',
      safe_next_action: expect.stringContaining('operator_confirmed_switch_send_restore'),
      cross_desktop: {
        current_desktop: 'desktop-current',
        target_desktop: 'desktop-target',
        policy: 'same_desktop_only',
        delivery_case: 'cross_desktop_hidden_input_refused',
        exact_safe_next_action: expect.stringContaining('manually switch'),
      },
    });
    expect((refused.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
    expect((refused.result as { event_artifact: string | null }).event_artifact).toContain('.ai/operator-surface-events/ose_');
    expect((confirmationRequired.result as { delivery_result: { status: string; state_path: string[]; reason: string; delivery_case: string; safe_next_action: string; cross_desktop: Record<string, unknown> }; mutation_performed: boolean }).delivery_result).toMatchObject({
      status: 'operator_confirmation_required',
      state_path: ['requested', 'operator_confirmation_required'],
      reason: 'cross_desktop_operator_confirmation_required',
      delivery_case: 'operator_confirmed_switch_send_restore',
      safe_next_action: expect.stringContaining('--cross-desktop-authority'),
      cross_desktop: {
        current_desktop: 'desktop-current',
        target_desktop: 'desktop-target',
        policy: 'operator_confirmed_switch_send_restore',
        operator_confirmed: false,
        restoration_evidence_required: true,
      },
    });
    expect((confirmationRequired.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
    expect((confirmed.result as { delivery_result: { status: string; state_path: string[]; delivery_case: string; cross_desktop: Record<string, unknown> }; mutation_performed: boolean }).delivery_result).toMatchObject({
      status: 'delivered',
      state_path: ['requested', 'operator_confirmed', 'delivered'],
      delivery_case: 'operator_confirmed_switch_send_restore',
      cross_desktop: {
        authority_ref: 'operator:cross-desktop-approved:1193',
        operator_confirmed: true,
        restoration_evidence_required: true,
      },
    });
    expect((confirmed.result as { mutation_performed: boolean }).mutation_performed).toBe(true);
    expect((admitted.result as { delivery_result: { status: string; cross_desktop: { authority_ref: string } }; mutation_performed: boolean }).delivery_result).toMatchObject({
      status: 'delivered',
      cross_desktop: { authority_ref: 'operator:cross-desktop-approved:1175' },
    });
    expect((admitted.result as { mutation_performed: boolean }).mutation_performed).toBe(true);
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
      current_site: 'narada',
      target_site: 'narada',
      message_route: {
        binding_status: 'unbound',
      },
      handoff: {
        status: 'discovery_required',
        command: null,
        discovery_commands: [
          'narada sites list --format json',
          'narada operator-surface status --format json',
          'narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus <runtime-locus-from-status> --handle <captured-hwnd-or-stable-handle>',
        ],
      },
      unblock_command: 'narada sites list --format json && narada operator-surface status --format json && narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus <runtime-locus-from-status> --handle <captured-hwnd-or-stable-handle>',
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
      reconciliation_command: 'narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus pc-site --handle <captured-hwnd-or-stable-handle>',
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
      current_site: 'narada',
      target_site: 'narada',
      message_route: {
        binding_status: 'labeled_unbound',
      },
      label_evidence_status: 'visible_label_without_binding',
      visible_label: {
        label: 'narada.builder',
        runtime_locus: 'pc-site',
      },
      explanation: expect.stringContaining('visible title/label'),
      unblock_command: 'narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus pc-site --handle <captured-hwnd-or-stable-handle>',
      reconciliation_command: 'narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus pc-site --handle <captured-hwnd-or-stable-handle>',
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
      current_site: 'narada',
      target_site: 'narada',
      identity_resolution: {
        requested_identity: 'observer',
        resolved_identity: 'narada-proper-observer',
        resolution: 'alias',
        matched_alias: 'observer',
      },
      unblock_command: 'narada sites list --format json && narada operator-surface status --format json && narada operator-surface bind-focused --identity narada-proper-observer --runtime-locus <runtime-locus-from-status> --handle <captured-hwnd-or-stable-handle>',
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
      current_site: 'narada',
      target_site: 'narada',
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

  it('refuses OSM delivery when another identity shares the selected live HWND', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-architect',
      role: 'architect',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      by: 'operator',
      format: 'json',
    }, createMockContext());
    await writeBindings(cwd, [
      { binding_id: 'bind-builder', identity_id: 'narada-proper-builder', runtime_locus: 'pc-site', handle: 'hwnd:1', input_capabilities: ['type_text'], status: 'active' },
      { binding_id: 'bind-architect', identity_id: 'narada-proper-architect', runtime_locus: 'pc-site', handle: 'hwnd:1', input_capabilities: ['type_text'], status: 'active' },
    ]);

    const result = await operatorSurfaceSendCommand({
      cwd,
      identity: 'narada-proper-builder',
      runtimeLocus: 'pc-site',
      text: 'next',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'binding_ambiguous',
      diagnostics: [{
        code: 'duplicate_live_handle_binding',
        handle: 'hwnd:1',
        binding_ids: ['bind-builder', 'bind-architect'],
      }],
      matching_bindings: expect.arrayContaining([
        expect.objectContaining({ binding_id: 'bind-builder', identity_id: 'narada-proper-builder', handle: 'hwnd:1' }),
        expect.objectContaining({ binding_id: 'bind-architect', identity_id: 'narada-proper-architect', handle: 'hwnd:1' }),
      ]),
    });
  });

  it('lists and refuses duplicate live singleton bindings during runtime binding reconciliation', async () => {
    const cwd = await tempRepo();
    await writeBindings(cwd, [
      { binding_id: 'bind-1', identity_id: 'narada-proper-builder', runtime_locus: 'pc-site', handle: 'hwnd:1', status: 'active' },
      { binding_id: 'bind-2', identity_id: 'narada-proper-builder', runtime_locus: 'pc-site', handle: 'hwnd:2', status: 'active' },
      { binding_id: 'bind-3', identity_id: 'narada-proper-architect', runtime_locus: 'pc-site', handle: 'hwnd:1', status: 'active' },
    ]);

    const listed = await operatorSurfaceBindingDeferredCommand('list', {
      cwd,
      runtimeLocus: 'pc-site',
      format: 'json',
    }, createMockContext());
    const cleaned = await operatorSurfaceBindingDeferredCommand('clean-stale', {
      cwd,
      runtimeLocus: 'pc-site',
      format: 'json',
    }, createMockContext());

    expect(listed.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(listed.result).toMatchObject({
      status: 'error',
      reason: 'binding_ambiguous',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate_live_handle_binding', handle: 'hwnd:1' }),
        expect.objectContaining({ code: 'duplicate_live_singleton_identity_binding', identity_id: 'narada-proper-builder' }),
      ]),
    });
    expect(cleaned.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(cleaned.result).toMatchObject({
      status: 'error',
      reason: 'binding_ambiguous',
      mutation_performed: false,
      runtime_binding_mutated: false,
      repair_evidence: {
        before_count: 3,
        before: expect.arrayContaining([
          expect.objectContaining({ binding_id: 'bind-1', handle: 'hwnd:1' }),
        ]),
        after: expect.arrayContaining([
          expect.objectContaining({ binding_id: 'bind-1', handle: 'hwnd:1' }),
        ]),
        normalized: false,
        postcondition_checks: {
          stale_bindings_removed: false,
          binding_uniqueness_rechecked: true,
          diagnostics_after: expect.arrayContaining([
            expect.objectContaining({ code: 'duplicate_live_handle_binding' }),
          ]),
        },
      },
    });
  });

  it('cleans dead runtime bindings and records repair evidence', async () => {
    const cwd = await tempRepo();
    await writeBindings(cwd, [
      { binding_id: 'bind-stale', identity_id: 'narada-proper-builder', runtime_locus: 'pc-site', handle: 'hwnd:old', status: 'stale' },
      { binding_id: 'bind-live', identity_id: 'narada-proper-builder', runtime_locus: 'pc-site', handle: 'hwnd:live', status: 'active' },
    ]);

    const cleaned = await operatorSurfaceBindingDeferredCommand('clean-stale', {
      cwd,
      runtimeLocus: 'pc-site',
      format: 'json',
    }, createMockContext());

    expect(cleaned.exitCode).toBe(ExitCode.SUCCESS);
    expect(cleaned.result).toMatchObject({
      status: 'success',
      mutation_performed: true,
      runtime_binding_mutated: true,
      removed_stale_count: 1,
      remaining_count: 1,
      repair_evidence: {
        before_count: 2,
        stale_count: 1,
        after_count: 1,
        before: expect.arrayContaining([
          expect.objectContaining({ binding_id: 'bind-stale', handle: 'hwnd:old' }),
          expect.objectContaining({ binding_id: 'bind-live', handle: 'hwnd:live' }),
        ]),
        after: [
          expect.objectContaining({ binding_id: 'bind-live', handle: 'hwnd:live' }),
        ],
        normalized: true,
        postcondition_checks: {
          stale_bindings_removed: true,
          binding_uniqueness_rechecked: true,
          diagnostics_after: [],
        },
      },
    });
    const bindings = JSON.parse(await readFile(join(cwd, 'operator-surfaces', 'runtime-bindings.json'), 'utf8')) as { bindings: Array<Record<string, unknown>> };
    expect(bindings.bindings).toEqual([expect.objectContaining({ binding_id: 'bind-live' })]);
  });

  it('suppresses duplicate visible overlay labels for one live HWND', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await writeVisibleLabels(cwd, [
      { identity_id: 'narada-proper-builder', runtime_locus: 'pc-site', hwnd: 'hwnd:1', label: 'builder', status: 'visible' },
      { identity_id: 'narada-proper-builder', runtime_locus: 'pc-site', hwnd: 'hwnd:1', label: 'builder duplicate', status: 'visible' },
    ]);

    const status = await operatorSurfaceStatusCommand({
      cwd,
      site: 'narada-proper',
      format: 'json',
    }, createMockContext());
    const compact = await operatorSurfaceInspectCompactCommand({
      cwd,
      site: 'narada-proper',
      format: 'json',
    }, createMockContext());

    expect(status.exitCode).toBe(ExitCode.SUCCESS);
    expect(status.result).toMatchObject({
      overlay_idempotence: {
        status: 'diagnostic',
        max_visible_labels_per_hwnd: 1,
        diagnostics: [{
          code: 'duplicate_visible_label_suppressed',
          handle: 'hwnd:1',
        }],
      },
    });
    expect(compact.exitCode).toBe(ExitCode.SUCCESS);
    expect(compact.result).toMatchObject({
      overlay_idempotence: {
        status: 'diagnostic',
        max_visible_labels_per_hwnd: 1,
      },
    });
  });

  it('reports operator-surface doctor diagnostics without collapsing labels into bindings', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-architect',
      role: 'architect',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      by: 'operator',
      inputCapabilities: 'type_text,submit',
      submitStrategy: 'known_surface_submit',
      format: 'json',
    }, createMockContext());
    await writeBindings(cwd, [
      {
        binding_id: 'bind-builder',
        identity_id: 'narada-proper-builder',
        runtime_locus: 'pc-site',
        handle: 'hwnd:1',
        input_capabilities: ['type_text'],
        status: 'active',
        target_evidence: {
          window_title: 'mutable title',
          window_class: 'WindowsTerminal',
          process_name: 'WindowsTerminal.exe',
          process_id: '1234',
        },
      },
      {
        binding_id: 'bind-architect',
        identity_id: 'narada-proper-architect',
        runtime_locus: 'pc-site',
        handle: 'hwnd:1',
        input_capabilities: ['type_text'],
        status: 'active',
        target_evidence: {
          window_title: 'same mutable title',
        },
      },
      {
        binding_id: 'bind-stale',
        identity_id: 'narada-proper-builder',
        runtime_locus: 'pc-site',
        handle: 'hwnd:old',
        status: 'stale',
      },
    ]);
    await writeVisibleLabels(cwd, [
      { identity_id: 'narada-proper-builder', runtime_locus: 'pc-site', hwnd: 'hwnd:1', label: 'builder', status: 'visible' },
      { identity_id: 'narada-proper-builder', runtime_locus: 'pc-site', hwnd: 'hwnd:1', label: 'builder duplicate', status: 'visible' },
    ]);

    const doctor = await operatorSurfaceDoctorCommand({
      cwd,
      site: 'narada-proper',
      runtimeLocus: 'pc-site',
      format: 'json',
    }, createMockContext());

    expect(doctor.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(doctor.result).toMatchObject({
      status: 'diagnostic',
      mutation_performed: false,
      projection_boundary: {
        runtime_binding_authority: 'owning runtime locus',
        visible_labels_are_projection_only: true,
        rebuilding_labels_repairs_runtime_bindings: false,
      },
      health: {
        status: 'attention_required',
        binding_uniqueness: 'fail',
        stale_bindings: 1,
        duplicate_hwnd_bindings: 1,
        overlay_idempotence: 'diagnostic',
        osm_delivery_ready: false,
      },
      binding_diagnostics: [
        expect.objectContaining({ code: 'duplicate_live_handle_binding', handle: 'hwnd:1' }),
      ],
      stale_bindings: [
        expect.objectContaining({
          binding_id: 'bind-stale',
          repair_command: 'narada operator-surface bindings clean-stale --runtime-locus pc-site',
        }),
      ],
      overlay_labels: {
        max_visible_labels_per_hwnd: 1,
        counts: [
          expect.objectContaining({ handle: 'hwnd:1', visible_count: 2 }),
        ],
        diagnostics: [
          expect.objectContaining({ code: 'duplicate_visible_label_suppressed' }),
        ],
      },
      binding_evidence_posture: expect.arrayContaining([
        expect.objectContaining({
          binding_id: 'bind-builder',
          posture: 'strong_evidence_available',
          title_authority: 'weak_supporting_evidence_not_binding_authority',
        }),
        expect.objectContaining({
          binding_id: 'bind-architect',
          posture: 'strong_evidence_available',
          title_authority: 'weak_supporting_evidence_not_binding_authority',
        }),
      ]),
      osm_delivery_readiness: expect.arrayContaining([
        expect.objectContaining({
          identity_id: 'narada-proper-builder',
          status: 'blocked',
          blockers: expect.arrayContaining(['binding_ambiguous']),
        }),
      ]),
      repair_commands: expect.arrayContaining([
        'narada operator-surface bindings clean-stale --runtime-locus pc-site',
      ]),
    });
  });

  it('projects directed obligations as activity evidence without treating labels as authority', async () => {
    const cwd = await tempRepo();
    await admitIdentity(cwd);
    mkdirSync(join(cwd, '.ai'), { recursive: true });
    const store = openTaskLifecycleStore(cwd);
    try {
      store.upsertDirectedObligation({
        obligation_id: 'obl_review_builder',
        source_kind: 'task_report',
        source_ref: 'wrr_builder',
        source_agent_id: 'bob',
        target_agent_id: 'narada-proper-builder',
        target_role: 'builder',
        target_ref: 'narada-proper-builder',
        kind: 'review_request',
        status: 'open',
        task_id: null,
        task_number: 1,
        evidence_json: JSON.stringify({ report_id: 'wrr_builder' }),
        consumption_rule_json: JSON.stringify({ review_command: 'narada task review 1 --agent narada-proper-builder --verdict accepted' }),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        consumed_at: null,
        consumed_by: null,
        consumption_ref: null,
      });
    } finally {
      store.db.close();
    }

    const status = await operatorSurfaceStatusCommand({
      cwd,
      site: 'narada-proper',
      format: 'json',
    }, createMockContext());

    expect(status.exitCode).toBe(ExitCode.SUCCESS);
    const agent = (status.result as { agents: Array<Record<string, unknown>> }).agents[0]!;
    expect(agent).toMatchObject({
      identity_id: 'narada-proper-builder',
      obligation_projection: {
        authority: 'sqlite_directed_obligations',
        status: 'open',
        count: 1,
      },
    });
    expect((agent.activity_projection as { visible: boolean }).visible).toBe(true);
    expect((agent.activity_projection as { source_evidence: unknown[] }).source_evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'directed_obligation',
        authority: 'sqlite_directed_obligations',
        status: 'open',
      }),
    ]));
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
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'narada-proper-resident',
      role: 'resident',
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
      {
        binding_id: 'resident-binding',
        identity_id: 'narada-proper-resident',
        runtime_locus: 'pc-site',
        handle: 'hwnd:resident',
        input_capabilities: ['type_text'],
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
      count: 4,
      agents: expect.arrayContaining([
        expect.objectContaining({
          identity_id: 'narada-proper-builder',
          role: 'builder',
          runtime_locus: 'pc-site',
          binding_status: 'bound',
          addressability_status: 'reachable',
          work_status: 'working',
          duty_loop_state: 'has_active_task',
          activity_projection: expect.objectContaining({
            state: 'executing',
            visible: true,
            authority: 'projection_only',
            freshness: 'current',
          }),
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
          duty_loop_state: 'unbound',
          activity_projection: expect.objectContaining({
            state: 'stale_evidence',
            visible: true,
            authority: 'projection_only',
            freshness: 'stale',
          }),
          current_task: null,
          last_activity_at: '2026-01-02T00:00:00Z',
          next_command: 'narada operator-surface bind-focused --identity narada-proper-architect --runtime-locus pc-site --handle <captured-hwnd-or-stable-handle>',
        }),
        expect.objectContaining({
          identity_id: 'narada-proper-observer',
          role: 'observer',
          runtime_locus: null,
          binding_status: 'unbound',
          addressability_status: 'unbound',
          work_status: 'untracked',
          duty_loop_state: 'unbound',
          activity_projection: expect.objectContaining({
            state: 'unknown',
            visible: true,
            authority: 'projection_only',
            freshness: 'unknown',
          }),
          current_task: null,
          next_command: 'narada sites list --format json && narada operator-surface status --format json && narada operator-surface bind-focused --identity narada-proper-observer --runtime-locus <runtime-locus-from-status> --handle <captured-hwnd-or-stable-handle>',
        }),
        expect.objectContaining({
          identity_id: 'narada-proper-resident',
          role: 'resident',
          binding_status: 'bound',
          addressability_status: 'reachable',
          work_status: 'untracked',
          duty_loop_state: 'idle',
          activity_projection: expect.objectContaining({
            state: 'idle',
            visible: false,
            rendering: 'hidden_default',
            authority: 'projection_only',
            freshness: 'current',
          }),
          current_task: null,
        }),
      ]),
    });
    const human = (result.result as { human: string[] }).human.join('\n');
    expect(human).toContain('observer: untracked');
    expect(human).toContain('activity=executing');
    expect(human).not.toContain('resident: untracked | identity=narada-proper-resident | addressability=reachable | activity=idle');
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
        requested_identity: 'self',
        identity: 'narada-proper-builder',
        resolved_identity: 'narada-proper-builder',
        source: 'environment',
        trust_class: 'authoritative_assertion',
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
          'narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus <runtime-locus-from-status> --handle <captured-hwnd-or-stable-handle>',
        ],
      },
      deferred_command: 'narada sites list --format json && narada operator-surface status --format json && narada operator-surface bind-focused --identity narada-proper-builder --runtime-locus <runtime-locus-from-status> --handle <captured-hwnd-or-stable-handle>',
    });
  });

  it('refuses bind-as-self when active roster work is the only identity evidence', async () => {
    const cwd = await tempRepo();
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
      identityName: 'narada-proper-builder',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      by: 'operator',
      format: 'json',
    }, createMockContext());
    await saveRoster(cwd, {
      version: 2,
      updated_at: '2026-05-01T19:30:00.000Z',
      agents: [{
        agent_id: 'narada-proper-builder',
        role: 'builder',
        capabilities: ['execute'],
        first_seen_at: '2026-05-01T19:30:00.000Z',
        last_active_at: '2026-05-01T19:30:00.000Z',
        status: 'working',
        task: 1133,
        last_done: null,
        updated_at: '2026-05-01T19:30:00.000Z',
      }],
    });

    const result = await operatorSurfaceBindFocusedCommand({
      cwd,
      as: 'self',
      runtimeLocus: 'narada',
      handle: 'hwnd:1001',
      observedHandle: 'hwnd:1001',
      windowTitle: 'narada.architect',
      windowClass: 'CASCADIA_HOSTING_WINDOW_CLASS',
      processName: 'WindowsTerminal.exe',
      processId: '4242',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'identity_unresolved',
      self_resolution: {
        requested_identity: 'self',
        identity: null,
        resolved_identity: null,
        candidate_identity: 'narada-proper-builder',
        source: 'active_roster_assignment',
        trust_class: 'untrusted_projection',
        blockers: expect.arrayContaining([
          expect.stringContaining('roster work is not identity authority'),
          expect.stringContaining('NARADA_OPERATOR_SURFACE_IDENTITY'),
        ]),
      },
      repair_command: expect.stringContaining('roster assignment cannot identify --as self'),
    });
    expect((result.result as { runtime_binding_mutated?: unknown }).runtime_binding_mutated).toBeUndefined();
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
      handle: 'hwnd:1001',
      observedHandle: 'hwnd:1001',
      windowTitle: 'narada.builder',
      windowClass: 'CASCADIA_HOSTING_WINDOW_CLASS',
      processName: 'WindowsTerminal.exe',
      processId: '4242',
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
        handle: 'hwnd:1001',
        transport: 'windows_hwnd',
        status: 'active',
        target_evidence: {
          requested_handle: 'hwnd:1001',
          observed_handle: 'hwnd:1001',
          window_title: 'narada.builder',
          window_class: 'CASCADIA_HOSTING_WINDOW_CLASS',
          process_name: 'WindowsTerminal.exe',
          process_id: '4242',
          ambient_foreground_used: false,
          asserted_identity: 'narada-proper-builder',
        },
        postcondition_evidence: {
          asserted_identity: 'narada-proper-builder',
          bound_handle: 'hwnd:1001',
          ambient_foreground_used: false,
        },
      },
      target_evidence: {
        requested_handle: 'hwnd:1001',
        observed_handle: 'hwnd:1001',
      },
      postcondition_evidence: {
        bound_handle: 'hwnd:1001',
      },
      ambient_foreground_refused: true,
    });
    const bindings = JSON.parse(await readFile(join(cwd, 'operator-surfaces', 'runtime-bindings.json'), 'utf8')) as { bindings: Array<Record<string, unknown>> };
    expect(bindings.bindings).toEqual([
      expect.objectContaining({
        identity_id: 'narada-proper-builder',
        runtime_locus: 'pc-site',
        handle: 'hwnd:1001',
        target_evidence: expect.objectContaining({
          requested_handle: 'hwnd:1001',
          observed_handle: 'hwnd:1001',
          ambient_foreground_used: false,
        }),
      }),
    ]);
  });

  it('refuses ambient foreground runtime binding without captured target evidence', async () => {
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
    const priorForeground = process.env.NARADA_FOREGROUND_HWND;
    const priorCodexThread = process.env.CODEX_THREAD_ID;
    const priorWtSession = process.env.WT_SESSION;
    process.env.NARADA_FOREGROUND_HWND = 'hwnd:wrong-foreground';
    delete process.env.CODEX_THREAD_ID;
    delete process.env.WT_SESSION;
    try {
      const result = await operatorSurfaceBindFocusedCommand({
        cwd,
        identity: 'narada-proper-builder',
        runtimeLocus: 'pc-site',
        format: 'json',
      }, createMockContext());

      expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
      expect(result.result).toMatchObject({
        status: 'error',
        reason: 'runtime_binding_target_evidence_required',
        mutation_performed: false,
        runtime_binding_mutated: false,
        ambient_foreground_refused: true,
        repair_command: expect.stringContaining('--handle <captured-hwnd-or-stable-handle>'),
      });
    } finally {
      if (priorForeground === undefined) {
        delete process.env.NARADA_FOREGROUND_HWND;
      } else {
        process.env.NARADA_FOREGROUND_HWND = priorForeground;
      }
      if (priorCodexThread === undefined) {
        delete process.env.CODEX_THREAD_ID;
      } else {
        process.env.CODEX_THREAD_ID = priorCodexThread;
      }
      if (priorWtSession === undefined) {
        delete process.env.WT_SESSION;
      } else {
        process.env.WT_SESSION = priorWtSession;
      }
    }
  });

  it('normalizes legacy narada-proper identity site when binding to canonical narada locus', async () => {
    const cwd = await tempRepo();
    await operatorSurfaceIdentityAddCommand({
      cwd,
      identityName: 'builder',
      role: 'builder',
      agentKind: 'codex_cli',
      site: 'narada-proper',
      by: 'operator',
      format: 'json',
    }, createMockContext());
    await writeBindings(cwd, [
      {
        binding_id: 'old-binding',
        identity_id: 'builder',
        runtime_locus: 'narada-proper',
        handle: 'codex-thread:old',
        transport: 'codex_cli_thread',
        input_capabilities: ['type_text', 'submit'],
        status: 'active',
      },
    ]);

    const result = await operatorSurfaceBindFocusedCommand({
      cwd,
      identity: 'builder',
      runtimeLocus: 'narada',
      handle: 'codex-thread:new',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      site_normalization: {
        before_site_id: 'narada-proper',
        after_site_id: 'narada',
      },
      binding: {
        identity_id: 'builder',
        runtime_locus: 'narada',
        handle: 'codex-thread:new',
      },
    });
    const identities = JSON.parse(await readFile(join(cwd, 'operator-surfaces', 'identities.json'), 'utf8')) as { identities: Array<Record<string, unknown>> };
    expect(identities.identities.find((entry) => entry.identity_id === 'builder')).toMatchObject({
      site_id: 'narada',
    });
    const bindings = JSON.parse(await readFile(join(cwd, 'operator-surfaces', 'runtime-bindings.json'), 'utf8')) as { bindings: Array<Record<string, unknown>> };
    expect(bindings.bindings).toEqual([
      expect.objectContaining({
        identity_id: 'builder',
        runtime_locus: 'narada',
        handle: 'codex-thread:new',
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
