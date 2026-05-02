import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  routingAddCommand,
  routingExplainCommand,
  routingListCommand,
  routingResolveCommand,
} from '../../src/commands/routing.js';
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
  const dir = await mkdtemp(join(tmpdir(), 'narada-routing-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('routing addressing registry', () => {
  it('adds, lists, resolves, and explains an active route', async () => {
    const cwd = await tempRepo();
    const add = await routingAddCommand({
      cwd,
      targetKind: 'site',
      targetRef: 'client-site',
      authorityLocus: 'client_service',
      addressKind: 'file_drop',
      addressRef: '/tmp/client-site/.narada/.ai/inbox-drop',
      transport: 'filesystem',
      capabilityKind: 'filesystem.write',
      priority: 10,
      fallbackTarget: 'site:user',
      evidenceRef: 'inbox:env_123',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(add.exitCode).toBe(ExitCode.SUCCESS);
    const route = (add.result as { route: { route_id: string; priority: number; secret_values_stored?: boolean }; secret_values_stored: boolean }).route;
    expect(route.priority).toBe(10);
    expect((add.result as { secret_values_stored: boolean }).secret_values_stored).toBe(false);
    expect(existsSync(join(cwd, '.ai', 'routing-addressing-registry.json'))).toBe(true);

    const list = await routingListCommand({
      cwd,
      targetKind: 'site',
      format: 'json',
    }, createMockContext());
    expect((list.result as { count: number }).count).toBe(1);

    const resolved = await routingResolveCommand({
      cwd,
      targetKind: 'site',
      targetRef: 'client-site',
      format: 'json',
    }, createMockContext());
    expect(resolved.exitCode).toBe(ExitCode.SUCCESS);
    expect((resolved.result as { selected: { route_id: string } }).selected.route_id).toBe(route.route_id);

    const explain = await routingExplainCommand({
      cwd,
      routeId: route.route_id,
      format: 'json',
    }, createMockContext());
    expect((explain.result as { admissibility_note: string }).admissibility_note).toContain('matching capability grant');
  });

  it('resolution picks the active route with the lowest priority and returns alternatives', async () => {
    const cwd = await tempRepo();
    await routingAddCommand({
      cwd,
      targetKind: 'site',
      targetRef: 'client-site',
      authorityLocus: 'client_service',
      addressKind: 'file_drop',
      addressRef: '/tmp/slow',
      transport: 'filesystem',
      priority: 50,
      by: 'operator',
      format: 'json',
    }, createMockContext());
    const fast = await routingAddCommand({
      cwd,
      targetKind: 'site',
      targetRef: 'client-site',
      authorityLocus: 'client_service',
      addressKind: 'file_drop',
      addressRef: '/tmp/fast',
      transport: 'filesystem',
      priority: 10,
      by: 'operator',
      format: 'json',
    }, createMockContext());
    const fastRoute = (fast.result as { route: { route_id: string } }).route;

    const resolved = await routingResolveCommand({
      cwd,
      targetKind: 'site',
      targetRef: 'client-site',
      transport: 'filesystem',
      format: 'json',
    }, createMockContext());
    const data = resolved.result as { selected: { route_id: string }; alternatives: unknown[] };
    expect(data.selected.route_id).toBe(fastRoute.route_id);
    expect(data.alternatives).toHaveLength(1);
  });

  it('does not select inactive routes', async () => {
    const cwd = await tempRepo();
    await routingAddCommand({
      cwd,
      targetKind: 'site',
      targetRef: 'client-site',
      authorityLocus: 'client_service',
      addressKind: 'file_drop',
      addressRef: '/tmp/inactive',
      transport: 'filesystem',
      inactive: true,
      by: 'operator',
      format: 'json',
    }, createMockContext());

    const resolved = await routingResolveCommand({
      cwd,
      targetKind: 'site',
      targetRef: 'client-site',
      format: 'json',
    }, createMockContext());
    expect(resolved.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((resolved.result as { status: string }).status).toBe('not_found');
  });
});
