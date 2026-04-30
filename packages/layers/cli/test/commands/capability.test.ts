import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock('node:child_process');
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import {
  capabilityAnnouncementCreateCommand,
  capabilityAnnouncementListCommand,
  capabilityAnnouncementPublishCommand,
  capabilityAnnouncementShowCommand,
  capabilityAnnouncementSupersedeCommand,
  capabilityBindCredentialCommand,
  capabilityCredentialPreflightCommand,
  capabilityExplainCommand,
  capabilityGrantCommand,
  capabilityListCommand,
  capabilityRevokeCommand,
} from '../../src/commands/capability.js';
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

async function tempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'narada-capability-'));
  tempDirs.push(dir);
  return dir;
}

function setupGitRepo(cwd: string): void {
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['init'], { cwd, stdio: 'ignore' });
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['config', 'user.email', 'test@example.com'], { cwd });
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['config', 'user.name', 'Test'], { cwd });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('capability consent registry', () => {
  it('grants, lists, explains, and revokes a bounded capability without storing secret values', async () => {
    const cwd = await tempRepo();
    const grantResult = await capabilityGrantCommand({
      cwd,
      site: 'utz',
      principal: 'andrey',
      agent: 'architect',
      kind: 'filesystem.write',
      scope: '{"root":".narada","mode":"local"}',
      allow: 'write_file,create_directory',
      deny: 'delete_tree',
      credentialRef: 'env:NARADA_UTZ_TOKEN',
      evidenceRef: 'inbox:env_123',
      expiresAt: '2099-01-01T00:00:00.000Z',
      by: 'andrey',
      format: 'json',
    }, createMockContext());

    expect(grantResult.exitCode).toBe(ExitCode.SUCCESS);
    const grantData = grantResult.result as { grant: { grant_id: string; credential_ref: string; allowed_actions: string[] }; secret_values_stored: boolean };
    expect(grantData.secret_values_stored).toBe(false);
    expect(grantData.grant.credential_ref).toBe('env:NARADA_UTZ_TOKEN');
    expect(grantData.grant.allowed_actions).toEqual(['write_file', 'create_directory']);
    expect(existsSync(join(cwd, '.ai', 'capability-consent-registry.json'))).toBe(true);

    const listResult = await capabilityListCommand({
      cwd,
      site: 'utz',
      status: 'active',
      format: 'json',
    }, createMockContext());
    expect(listResult.exitCode).toBe(ExitCode.SUCCESS);
    const listData = listResult.result as { count: number; grants: Array<{ grant_id: string; effective_status: string }> };
    expect(listData.count).toBe(1);
    expect(listData.grants[0].effective_status).toBe('active');

    const explainResult = await capabilityExplainCommand({
      cwd,
      grantId: grantData.grant.grant_id,
      format: 'json',
    }, createMockContext());
    expect(explainResult.exitCode).toBe(ExitCode.SUCCESS);
    expect((explainResult.result as { admissible_for_execution: boolean }).admissible_for_execution).toBe(true);

    const revokeResult = await capabilityRevokeCommand({
      cwd,
      grantId: grantData.grant.grant_id,
      by: 'andrey',
      reason: 'rotation',
      format: 'json',
    }, createMockContext());
    expect(revokeResult.exitCode).toBe(ExitCode.SUCCESS);
    expect((revokeResult.result as { grant: { status: string; revocation_reason: string } }).grant.status).toBe('revoked');
    expect((revokeResult.result as { grant: { revocation_reason: string } }).grant.revocation_reason).toBe('rotation');

    const revokedExplain = await capabilityExplainCommand({
      cwd,
      grantId: grantData.grant.grant_id,
      format: 'json',
    }, createMockContext());
    expect((revokedExplain.result as { admissible_for_execution: boolean; blockers: string[] }).admissible_for_execution).toBe(false);
    expect((revokedExplain.result as { blockers: string[] }).blockers).toContain('grant revoked');
  });

  it('rejects raw credential-looking values', async () => {
    const cwd = await tempRepo();
    const result = await capabilityGrantCommand({
      cwd,
      site: 'utz',
      principal: 'andrey',
      kind: 'github.repo',
      allow: 'push',
      credentialRef: 'ghp_raw_secret_value',
      by: 'andrey',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((result.result as { error: string }).error).toContain('credential_ref must be a reference');
  });

  it('binds an existing credential reference with provenance and redacted output', async () => {
    const cwd = await tempRepo();
    const original = process.env.NARADA_TEST_GRAPH_SECRET;
    process.env.NARADA_TEST_GRAPH_SECRET = 'super-secret-value';
    try {
      const result = await capabilityBindCredentialCommand({
        cwd,
        site: 'cpy',
        principal: 'operator',
        kind: 'graph.client_credentials',
        scope: '{"tenant":"global-maxima"}',
        allow: 'graph.token.request',
        credentialRef: 'env:NARADA_TEST_GRAPH_SECRET',
        localEnv: 'NARADA_TEST_GRAPH_SECRET',
        reusedFromSite: 'narada.sonar',
        evidenceRef: 'inbox:env_credential_reuse',
        rationale: 'Reuse existing Graph app posture for client-service onboarding',
        by: 'operator',
        format: 'json',
      }, createMockContext());

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const output = JSON.stringify(result.result);
      expect(output).not.toContain('super-secret-value');
      const data = result.result as {
        secret_values_stored: boolean;
        local_secret_material_available: boolean;
        credential_binding: {
          reused_from_site: string;
          local_material: { env_var: string; status: string };
          raw_secret_stored: boolean;
        };
        grant: { credential_provenance: { reused_from_site: string; raw_secret_stored: boolean } };
      };
      expect(data.secret_values_stored).toBe(false);
      expect(result.result).toMatchObject({
        credential_operation: {
          kind: 'bind_existing_secret',
          remote_secret_mutation: false,
          local_runtime_env_mutation: false,
          requires_remote_secret_approval: false,
          authority_note: expect.stringContaining('must not create or rotate upstream secrets'),
        },
      });
      expect(data.local_secret_material_available).toBe(true);
      expect(data.credential_binding).toMatchObject({
        reused_from_site: 'narada.sonar',
        local_material: { env_var: 'NARADA_TEST_GRAPH_SECRET', status: 'present' },
        raw_secret_stored: false,
      });
      expect(data.grant.credential_provenance).toMatchObject({
        reused_from_site: 'narada.sonar',
        raw_secret_stored: false,
      });
    } finally {
      if (original === undefined) delete process.env.NARADA_TEST_GRAPH_SECRET;
      else process.env.NARADA_TEST_GRAPH_SECRET = original;
    }
  });

  it('records missing local secret material without rejecting the credential reference', async () => {
    const cwd = await tempRepo();
    delete process.env.NARADA_TEST_MISSING_SECRET;
    const result = await capabilityBindCredentialCommand({
      cwd,
      site: 'cpy',
      principal: 'operator',
      kind: 'graph.client_credentials',
      allow: 'graph.token.request',
      credentialRef: 'env:NARADA_TEST_MISSING_SECRET',
      localEnv: 'NARADA_TEST_MISSING_SECRET',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.result as { local_secret_material_available: boolean }).local_secret_material_available).toBe(false);
    expect((result.result as { credential_binding: { local_material: { status: string } } }).credential_binding.local_material.status).toBe('missing');
    expect((result.result as { warnings: string[] }).warnings[0]).toContain('Local secret material not found');
  });

  it('marks expired active grants as expired in list and explain output', async () => {
    const cwd = await tempRepo();
    const grantResult = await capabilityGrantCommand({
      cwd,
      site: 'utz',
      principal: 'andrey',
      kind: 'site.delivery',
      allow: 'deliver_file',
      expiresAt: '2000-01-01T00:00:00.000Z',
      by: 'andrey',
      format: 'json',
    }, createMockContext());
    const grantId = (grantResult.result as { grant: { grant_id: string } }).grant.grant_id;

    const listResult = await capabilityListCommand({
      cwd,
      status: 'expired',
      format: 'json',
    }, createMockContext());
    expect((listResult.result as { count: number }).count).toBe(1);

    const explainResult = await capabilityExplainCommand({
      cwd,
      grantId,
      format: 'json',
    }, createMockContext());
    expect((explainResult.result as { blockers: string[] }).blockers).toContain('grant expired');
  });

  it('preflights local credential binding without remote secret mutation', async () => {
    const cwd = await tempRepo();
    const result = await capabilityCredentialPreflightCommand({
      cwd,
      site: 'narada-proper',
      principal: 'operator',
      kind: 'voice.transcription.remote',
      operation: 'bind_existing_secret',
      credentialRef: 'env:HARMONIA_VOICE_TRANSCRIPTION_TOKEN',
      localEnv: 'HARMONIA_VOICE_TRANSCRIPTION_TOKEN',
      by: 'builder',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      mutation_performed: false,
      operation: 'bind_existing_secret',
      operation_classification: {
        effect_class: 'local_reference_binding',
        requires_explicit_approval: false,
        remote_secret_mutation: false,
        adapter_setup_may_perform_as_side_effect: false,
      },
      preflight_paths: {
        existing_local_credential_binding: 'candidate',
        create_new_secret: 'not_selected',
        rotate_remote_secret: 'not_selected',
      },
      recommended_safe_default: 'bind_existing_secret',
      raw_secret_exposed: false,
    });
  });

  it('blocks remote secret rotation unless explicit approval is present', async () => {
    const cwd = await tempRepo();
    const blocked = await capabilityCredentialPreflightCommand({
      cwd,
      site: 'narada-proper',
      principal: 'operator',
      kind: 'voice.transcription.remote',
      operation: 'rotate_remote_secret',
      remoteWorker: 'harmonia-voice-transcription',
      remoteSecretName: 'TRANSCRIPTION_BEARER_TOKEN',
      by: 'builder',
      format: 'json',
    }, createMockContext());

    expect(blocked.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(blocked.result).toMatchObject({
      status: 'error',
      operation: 'rotate_remote_secret',
      operation_classification: {
        effect_class: 'dangerous_external_effect',
        requires_explicit_approval: true,
        remote_secret_mutation: true,
        approval_recorded: false,
        adapter_setup_may_perform_as_side_effect: false,
      },
      blockers: ['rotate_remote_secret requires explicit --approve-remote-secret-mutation'],
      preflight_paths: {
        rotate_remote_secret: 'requires_approval',
      },
    });

    const approved = await capabilityCredentialPreflightCommand({
      cwd,
      site: 'narada-proper',
      principal: 'operator',
      kind: 'voice.transcription.remote',
      operation: 'rotate_remote_secret',
      remoteWorker: 'harmonia-voice-transcription',
      remoteSecretName: 'TRANSCRIPTION_BEARER_TOKEN',
      approveRemoteSecretMutation: true,
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(approved.exitCode).toBe(ExitCode.SUCCESS);
    expect(approved.result).toMatchObject({
      status: 'success',
      operation_classification: {
        approval_recorded: true,
        remote_secret_mutation: true,
      },
      credential_posture: {
        remote_secret_target: {
          worker: 'harmonia-voice-transcription',
          secret_name: 'TRANSCRIPTION_BEARER_TOKEN',
        },
        raw_secret_exposed: false,
      },
      preflight_paths: {
        rotate_remote_secret: 'approved',
      },
    });
  });
});

describe('capability announcement registry', () => {
  it('creates, lists, discovers, publishes, and supersedes typed capability announcements', async () => {
    const cwd = await tempRepo();
    setupGitRepo(cwd);

    const created = await capabilityAnnouncementCreateCommand({
      cwd,
      id: 'operator_surface_message_passing',
      summary: 'Send bounded text to a known Operator Surface channel',
      ownerSite: 'user-pc-site',
      authorityScope: 'runtime-locus operator surface input only',
      usableBy: 'Operator,Architect,Builder',
      entrypoint: 'tools/operator-surface/Send-Os.ps1,tools/operator-surface/Send-OperatorSurfaceInput.ps1',
      prerequisite: 'runtime identity binding,known_surface_submit strategy',
      evidence: 'observation:successful-send-20260430',
      constraint: 'no raw secrets,no blind submit probing',
      safetyPosture: 'known_surface_submit_required',
      adoptionPosture: 'operator_entrypoint',
      by: 'builder',
      format: 'json',
    }, createMockContext());

    expect(created.exitCode).toBe(ExitCode.SUCCESS);
    const announcement = (created.result as { announcement: { capability_id: string; entrypoints: string[]; constraints: string[] } }).announcement;
    expect(announcement.capability_id).toBe('operator_surface_message_passing');
    expect(announcement.entrypoints).toContain('tools/operator-surface/Send-Os.ps1');
    expect(announcement.constraints).toContain('no raw secrets');
    expect(existsSync(join(cwd, '.ai', 'capability-announcements.json'))).toBe(true);

    const listed = await capabilityAnnouncementListCommand({
      cwd,
      ownerSite: 'user-pc-site',
      status: 'active',
      format: 'json',
    }, createMockContext());
    expect((listed.result as { count: number }).count).toBe(1);

    const shown = await capabilityAnnouncementShowCommand({
      cwd,
      id: 'operator_surface_message_passing',
      format: 'json',
    }, createMockContext());
    expect((shown.result as { announcement: { authority_scope: string } }).announcement.authority_scope).toContain('runtime-locus');

    const published = await capabilityAnnouncementPublishCommand({
      cwd,
      id: 'operator_surface_message_passing',
      by: 'builder',
      format: 'json',
    }, createMockContext());
    expect(published.exitCode).toBe(ExitCode.SUCCESS);
    expect((published.result as { inbox: { envelope: { kind: string; payload: { capability_announcement: { capability_id: string } } } } }).inbox.envelope).toMatchObject({
      kind: 'observation',
      payload: {
        capability_announcement: {
          capability_id: 'operator_surface_message_passing',
        },
      },
    });

    await capabilityAnnouncementCreateCommand({
      cwd,
      id: 'operator_surface_message_passing_v2',
      summary: 'Send bounded text to a known Operator Surface channel with explicit confirmation',
      ownerSite: 'user-pc-site',
      authorityScope: 'runtime-locus operator surface input only',
      usableBy: 'Operator,Architect,Builder',
      entrypoint: 'tools/operator-surface/Send-OperatorSurfaceInput.ps1',
      prerequisite: 'runtime identity binding,operator_confirmed_submit strategy',
      evidence: 'observation:successful-send-20260430',
      constraint: 'no raw secrets,no blind submit probing',
      safetyPosture: 'operator_confirmed_submit_required',
      adoptionPosture: 'operator_entrypoint',
      by: 'builder',
      format: 'json',
    }, createMockContext());

    const superseded = await capabilityAnnouncementSupersedeCommand({
      cwd,
      id: 'operator_surface_message_passing',
      replacementId: 'operator_surface_message_passing_v2',
      by: 'builder',
      reason: 'Require explicit submit posture naming',
      format: 'json',
    }, createMockContext());

    expect(superseded.exitCode).toBe(ExitCode.SUCCESS);
    expect((superseded.result as { announcement: { status: string; superseded_by: string } }).announcement).toMatchObject({
      status: 'superseded',
      superseded_by: 'operator_surface_message_passing_v2',
    });
  });
});
