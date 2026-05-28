import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  carrierActionsListCommand,
  carrierActionsShowCommand,
} from '../../src/commands/carrier-actions.js';
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
  const dir = join(process.cwd(), '.ai', 'tmp-tests', `carrier-actions-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

async function writeDecision(cwd: string, requestId: string, decision: string): Promise<string> {
  const dir = join(cwd, '.narada', 'crew', 'action-admission');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${requestId}.json`);
  await writeFile(path, `${JSON.stringify({
    schema: 'narada.carrier_action_admission_decision.v0',
    request_id: requestId,
    created_at: '2026-05-26T00:00:00.000Z',
    decision,
    reason: 'test',
    authority_owner: 'task_governance_service',
    carrier_mutation_admitted: false,
    candidate_ref: join(dir, 'candidates', `${requestId}.task.json`),
    request: {
      requested_action: {
        tool: 'task_lifecycle_claim',
        declared_family: 'task_lifecycle_mutation',
      },
    },
  })}\n`, 'utf8');
  return path;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('carrier action admission inspection', () => {
  it('lists and shows read-only admission evidence', async () => {
    const cwd = await tempRepo();
    const path = await writeDecision(cwd, 'car_act_test', 'routed');

    const list = await carrierActionsListCommand({
      cwd,
      decision: 'routed',
      format: 'json',
    }, createMockContext());
    expect(list.exitCode).toBe(ExitCode.SUCCESS);
    expect((list.result as { count: number }).count).toBe(1);
    expect((list.result as { decisions: Array<{ request_id: string; path: string }> }).decisions[0]).toMatchObject({
      request_id: 'car_act_test',
      path,
    });

    const show = await carrierActionsShowCommand({
      cwd,
      requestId: 'car_act_test',
      format: 'json',
    }, createMockContext());
    expect(show.exitCode).toBe(ExitCode.SUCCESS);
    expect((show.result as { record: { decision: string } }).record.decision).toBe('routed');
  });

  it('reports missing records without mutating state', async () => {
    const cwd = await tempRepo();
    const show = await carrierActionsShowCommand({
      cwd,
      requestId: 'missing',
      format: 'json',
    }, createMockContext());
    expect(show.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((show.result as { mutation_performed: boolean; error: string }).mutation_performed).toBe(false);
    expect((show.result as { error: string }).error).toContain('not found');
  });

  it('rejects unsafe request ids', async () => {
    const cwd = await tempRepo();
    const show = await carrierActionsShowCommand({
      cwd,
      requestId: '..\\outside',
      format: 'json',
    }, createMockContext());
    expect(show.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((show.result as { error: string }).error).toContain('may only contain');
  });
});
