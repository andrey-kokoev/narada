import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
});
