import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  admissionExplainCommand,
  admissionListCommand,
  admissionRecordCommand,
} from '../../src/commands/admission.js';
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
  const dir = await mkdtemp(join(tmpdir(), 'narada-admission-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('admission rejection ledger', () => {
  it('records, lists, and explains a rejected candidate decision', async () => {
    const cwd = await tempRepo();
    const record = await admissionRecordCommand({
      cwd,
      candidateId: 'drop:001',
      sourceKind: 'file_drop',
      sourceRef: '.ai/inbox-drop/001.md',
      candidateKind: 'envelope',
      decision: 'rejected',
      reasons: 'duplicate,out_of_scope',
      evidenceRefs: 'dry-run:abc',
      by: 'operator',
      systemRule: 'file_drop_v0',
      authorityLevel: 'operator_confirmed',
      observedAt: '2026-04-28T00:00:00.000Z',
      format: 'json',
    }, createMockContext());

    expect(record.exitCode).toBe(ExitCode.SUCCESS);
    const entry = (record.result as { entry: { decision_id: string; decision: string; raw_payload_stored?: boolean }; raw_payload_stored: boolean }).entry;
    expect(entry.decision).toBe('rejected');
    expect((record.result as { raw_payload_stored: boolean }).raw_payload_stored).toBe(false);
    expect(existsSync(join(cwd, '.ai', 'admission-rejection-ledger.json'))).toBe(true);

    const list = await admissionListCommand({
      cwd,
      decision: 'rejected',
      format: 'json',
    }, createMockContext());
    expect(list.exitCode).toBe(ExitCode.SUCCESS);
    expect((list.result as { count: number }).count).toBe(1);

    const explain = await admissionExplainCommand({
      cwd,
      decisionId: entry.decision_id,
      format: 'json',
    }, createMockContext());
    expect(explain.exitCode).toBe(ExitCode.SUCCESS);
    expect((explain.result as { outcome: string }).outcome).toContain('rejected');
  });

  it('requires a resulting envelope id for admitted candidates', async () => {
    const cwd = await tempRepo();
    const record = await admissionRecordCommand({
      cwd,
      candidateId: 'drop:002',
      sourceKind: 'file_drop',
      sourceRef: '.ai/inbox-drop/002.md',
      candidateKind: 'envelope',
      decision: 'admitted',
      reasons: 'valid',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(record.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((record.result as { error: string }).error).toContain('--resulting-envelope-id is required');
  });

  it('records admitted, deferred, and superseded decisions', async () => {
    const cwd = await tempRepo();
    for (const [decision, extra] of [
      ['admitted', { resultingEnvelopeId: 'env_1' }],
      ['deferred', {}],
      ['superseded', { supersedes: 'drop:old' }],
    ] as const) {
      const record = await admissionRecordCommand({
        cwd,
        candidateId: `candidate:${decision}`,
        sourceKind: 'mailbox',
        sourceRef: `message:${decision}`,
        candidateKind: 'proposal',
        decision,
        reasons: 'policy',
        by: 'system',
        authorityLevel: 'system_observed',
        ...extra,
        format: 'json',
      }, createMockContext());
      expect(record.exitCode).toBe(ExitCode.SUCCESS);
    }

    const list = await admissionListCommand({
      cwd,
      sourceKind: 'mailbox',
      format: 'json',
    }, createMockContext());
    expect((list.result as { count: number }).count).toBe(3);
  });
});
