import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteInboxStore } from '@narada2/control-plane';
import { operatorStartCommand } from '../../src/commands/operator.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

function writeConfig(siteRoot: string, options: { governance?: boolean; siteKind?: string; capabilityChoices?: Record<string, unknown> } = {}): void {
  mkdirSync(join(siteRoot, '.ai'), { recursive: true });
  writeFileSync(join(siteRoot, 'config.json'), JSON.stringify({
    site_id: 'test-site',
    ...(options.siteKind ? { site_kind: options.siteKind } : {}),
    ...(options.capabilityChoices ? { capability_choices: options.capabilityChoices } : {}),
    ...(options.governance ? {
      governance: {
        governing_law_source: { source_site_id: 'narada-proper', mode: 'inherited' },
        authority_locus: { locus_kind: 'project', mutation_policy: 'direct_only_at_locus' },
        mutation_evidence_locus: { kind: 'git', path: siteRoot },
        embodiments: [{ embodiment_id: 'test-site-local', root: siteRoot }],
        readiness_phase: 'inhabited_onboarding',
      },
    } : {}),
  }, null, 2));
}

function writeIdentity(siteRoot: string, options: { capabilities?: string[]; submitStrategy?: string } = {}): void {
  mkdirSync(join(siteRoot, 'operator-surfaces'), { recursive: true });
  writeFileSync(join(siteRoot, 'operator-surfaces', 'identities.json'), JSON.stringify({
    schema: 'https://narada.dev/schemas/operator-surface-identities/v1',
    updated_at: '2026-01-01T00:00:00Z',
    identities: [
      {
        identity_id: 'test-site-architect',
        site_id: 'test-site',
        role: 'architect',
        agent_kind: 'codex_cli',
        label: 'test-site-architect',
        input_capabilities: options.capabilities ?? ['focus', 'type_text'],
        ...(options.submitStrategy === undefined ? { submit_strategy: 'type_only' } : options.submitStrategy ? { submit_strategy: options.submitStrategy } : {}),
        admitted_by: 'operator',
        admitted_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        authority_limits: ['surface_does_not_grant_effect_capability'],
      },
    ],
  }, null, 2));
}

function insertInbox(siteRoot: string): void {
  const store = new SqliteInboxStore(join(siteRoot, '.ai', 'inbox.db'));
  try {
    store.insert({
      envelope_id: 'env_test',
      received_at: '2026-01-01T00:00:00Z',
      source: { kind: 'user_chat', ref: 'test' },
      kind: 'observation',
      authority: { level: 'operator_confirmed', principal: 'operator' },
      payload: { title: 'Pending work' },
    });
  } finally {
    store.close();
  }
}

describe('operator start command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-operator-start-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports missing Site without mutation', async () => {
    const missing = join(tempDir, 'missing-site');

    const result = await operatorStartCommand({ site: missing, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'site_absent',
      mutation_performed: false,
      command_authority: { read_only: true, mutates_site_state: false },
      readiness: {
        posture: 'site_absent',
        blockers: expect.arrayContaining([expect.objectContaining({ name: 'site_root_exists', next_command: expect.stringContaining('sites init') })]),
        onboarding: { state: 'not_yet_onboarded' },
      },
    });
  });

  it('reports initialized but unready Site', async () => {
    const site = join(tempDir, 'site');
    mkdirSync(site);

    const result = await operatorStartCommand({ site, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'initialized_unready',
      next_command: expect.stringContaining('sites doctor'),
      readiness: {
        posture: 'initialized_unready',
        warnings: [expect.objectContaining({ name: 'readiness_phase_declared' })],
      },
    });
  });

  it('reports ready Site with missing role binding', async () => {
    const site = join(tempDir, 'site');
    mkdirSync(site);
    writeConfig(site);

    const result = await operatorStartCommand({ site, role: 'architect', format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'ready_missing_role_binding',
      role_binding: { role: 'architect', identity_id: null },
      next_command: `narada operator-surface agent instantiate --cwd ${JSON.stringify(site)} --site ${JSON.stringify(site)} --role architect --agent-kind codex_cli --by <principal>`,
      readiness: {
        posture: 'ready_missing_role_binding',
        blockers: expect.arrayContaining([expect.objectContaining({
          name: 'role_identity_exists',
          next_command: `narada operator-surface agent instantiate --cwd ${JSON.stringify(site)} --site ${JSON.stringify(site)} --role architect --agent-kind codex_cli --by <principal>`,
        })]),
      },
    });
  });

  it('reports missing transport when role exists without input posture', async () => {
    const site = join(tempDir, 'site');
    mkdirSync(site);
    writeConfig(site);
    writeIdentity(site, { capabilities: [], submitStrategy: '' });

    const result = await operatorStartCommand({ site, role: 'architect', format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'ready_missing_transport',
      next_command: 'narada operator-surface bind-focused --as self',
      readiness: {
        posture: 'ready_missing_transport',
        blockers: expect.arrayContaining([expect.objectContaining({ name: 'operator_surface_transport_declared' })]),
      },
    });
  });

  it('reports pending inbox before fully idle', async () => {
    const site = join(tempDir, 'site');
    mkdirSync(site);
    writeConfig(site);
    writeIdentity(site);
    insertInbox(site);

    const result = await operatorStartCommand({ site, role: 'architect', format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'ready_pending_inbox',
      pending_inbox: [expect.objectContaining({ envelope_id: 'env_test', title: 'Pending work' })],
      mutation_performed: false,
      readiness: {
        posture: 'ready_pending_inbox',
        pending_inbox: [expect.objectContaining({ envelope_id: 'env_test' })],
      },
    });
  });

  it('reports fully idle ready Site with governance coordinates and onboarding posture', async () => {
    const site = join(tempDir, 'site');
    mkdirSync(site);
    writeConfig(site, { governance: true });
    writeIdentity(site);

    const result = await operatorStartCommand({ site, role: 'architect', operation: 'op-1', execute: true, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'fully_idle',
      target_locus: { operation: 'op-1' },
      command_authority: {
        read_only: true,
        execute_requested: true,
        execute_supported: false,
      },
      readiness: {
        posture: 'fully_idle',
        onboarding: { state: 'inhabited_onboarding', source: 'governance.readiness_phase' },
        coordinates: {
          governing_law_source: { source_site_id: 'narada-proper' },
          authority_locus: { locus_kind: 'project' },
          evidence_locus: { kind: 'git' },
          embodiments: [expect.objectContaining({ embodiment_id: 'test-site-local' })],
          operator_surface_posture: { role: 'architect', bound_transport: true },
        },
        blockers: [],
      },
      mutation_performed: false,
      bounded_output: true,
    });
  });

  it('surfaces unresolved client-service onboarding choices before inhabited readiness', async () => {
    const site = join(tempDir, 'site');
    mkdirSync(site);
    writeConfig(site, { governance: true, siteKind: 'client_service' });
    writeIdentity(site);

    const result = await operatorStartCommand({ site, role: 'architect', format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'fully_idle',
      readiness: {
        posture: 'fully_idle',
        blockers: [],
        readiness_strata: {
          structural: 'fully_idle',
          business_capability: {
            status: 'choices_unresolved',
            unresolved_count: 8,
          },
        },
        capability_choices: {
          site_kind: 'client_service',
          required_before_inhabited_readiness: true,
          choices: expect.arrayContaining([
            expect.objectContaining({
              number: 1,
              id: 'mailbox_intake_posture',
              status: 'unresolved',
              options: ['none_for_now', 'bind_existing_mailbox', 'provision_or_request_mailbox'],
            }),
          ]),
        },
        warnings: expect.arrayContaining([
          expect.objectContaining({ name: 'client_service_capability_choices', status: 'warn' }),
        ]),
      },
    });
  });

  it('treats answered or deferred client-service capability choices as business-ready', async () => {
    const site = join(tempDir, 'site');
    mkdirSync(site);
    writeConfig(site, {
      governance: true,
      siteKind: 'client_service',
      capabilityChoices: {
        mailbox_intake_posture: 'none_for_now',
        allowed_correspondents_or_domains: { status: 'deferred' },
        runtime_behavior: 'manual_only',
        sync_posture: 'metadata_only',
        source_data_loci: 'none_declared',
        affiliated_data_or_elt_sites: 'none_for_now',
        reporting_surfaces: 'operator_console_only',
        operator_surface_roles: 'architect_builder_observer',
      },
    });
    writeIdentity(site);

    const result = await operatorStartCommand({ site, role: 'architect', format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'fully_idle',
      readiness: {
        readiness_strata: {
          structural: 'fully_idle',
          business_capability: {
            status: 'ready',
            unresolved_count: 0,
          },
        },
        capability_choices: {
          site_kind: 'client_service',
          required_before_inhabited_readiness: true,
        },
      },
    });
    expect(result.result.readiness.warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'client_service_capability_choices' }),
    ]));
  });

  it('proves first-time Operator onboarding from fresh posture to next governed work guidance', async () => {
    const missing = join(tempDir, 'missing-site');
    const absent = await operatorStartCommand({ site: missing, role: 'architect', format: 'json' });
    expect(absent.exitCode).toBe(ExitCode.SUCCESS);
    expect(absent.result).toMatchObject({
      status: 'success',
      posture: 'site_absent',
      mutation_performed: false,
      bounded_output: true,
      target_locus: { site_root: missing },
      command_authority: { read_only: true, mutates_site_state: false },
      readiness: {
        onboarding: { state: 'not_yet_onboarded' },
        blockers: expect.arrayContaining([expect.objectContaining({
          name: 'site_root_exists',
          next_command: `narada sites init --root ${JSON.stringify(missing)}`,
        })]),
      },
      next_command: `narada sites init --root ${JSON.stringify(missing)}`,
    });

    const site = join(tempDir, 'site');
    mkdirSync(site);
    writeConfig(site, { governance: true });
    const missingCapability = await operatorStartCommand({ site, role: 'architect', format: 'json' });
    expect(missingCapability.exitCode).toBe(ExitCode.SUCCESS);
    expect(missingCapability.result).toMatchObject({
      status: 'success',
      posture: 'ready_missing_role_binding',
      readiness: {
        coordinates: {
          governing_law_source: { source_site_id: 'narada-proper' },
          authority_locus: { locus_kind: 'project' },
          evidence_locus: { kind: 'git' },
        },
        blockers: expect.arrayContaining([expect.objectContaining({
          name: 'role_identity_exists',
          next_command: expect.stringContaining('operator-surface agent instantiate'),
        })]),
      },
      next_command: expect.stringContaining('operator-surface agent instantiate'),
    });

    writeIdentity(site);
    const ready = await operatorStartCommand({ site, role: 'architect', format: 'json' });
    expect(ready.exitCode).toBe(ExitCode.SUCCESS);
    expect(ready.result).toMatchObject({
      status: 'success',
      posture: 'fully_idle',
      bounded_output: true,
      pending_inbox: [],
      readiness: {
        posture: 'fully_idle',
        blockers: [],
        warnings: [],
        coordinates: {
          operator_surface_posture: {
            role: 'architect',
            identity_id: 'test-site-architect',
            bound_transport: true,
          },
        },
      },
      next_command: 'narada work-next --agent architect --format json',
    });
  });
});
