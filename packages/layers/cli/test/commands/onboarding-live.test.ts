import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

const workspaceLaunchMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/commands/workspace-launch-application.js', () => ({
  workspaceLaunchCommand: workspaceLaunchMock,
}));

import { onboardingStartCommand } from '../../src/commands/onboarding.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

const tempDirs: string[] = [];

function createMockContext(): CommandContext {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() };
  return { configPath: '/test/config.json', logger: logger as unknown as CommandContext['logger'], verbose: false };
}

afterEach(async () => {
  workspaceLaunchMock.mockReset();
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('User Site onboarding on the real filesystem', () => {
  it('provisions a missing User Site before launching its resident', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-onboarding-live-'));
    tempDirs.push(root);
    const registry = join(root, 'config', 'launch', 'agents.json');
    workspaceLaunchMock.mockResolvedValueOnce({
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'launched',
        launch_agents: [{ agent: 'user-site.resident', launch_session_id: 'launch-live-test' }],
      },
    });

    const result = await onboardingStartCommand({ siteRoot: root, registryPath: registry, format: 'json' }, createMockContext());

    expect(result.exitCode, JSON.stringify(result.result, null, 2)).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'launched',
      mutation_performed: true,
      user_site: { resident_agent: 'user-site.resident' },
    });
    expect(JSON.parse(await readFile(registry, 'utf8'))).toMatchObject({
      Agents: [{ Agent: 'user-site.resident', Role: 'resident', OperatorSurface: 'agent-web-ui' }],
    });
    expect(workspaceLaunchMock).toHaveBeenCalledWith(expect.objectContaining({
      agent: ['user-site.resident'],
      registryPath: registry,
      dryRun: false,
    }), expect.anything());
  });
});
