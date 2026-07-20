import { describe, expect, it } from 'vitest';
import {
  workspaceLaunchCommandArgv,
  workspaceLaunchNodeNaradaCommandSpec,
  workspaceLaunchPnpmNaradaCommandSpec,
  workspaceLaunchRuntimeCommandSpec,
  workspaceLaunchSmokeCommandSpec,
} from '../../src/commands/workspace-launch-command-spec.js';

const options = {
  operatorSurface: 'agent-cli',
  siteRoot: 'D:/code/example',
  agent: 'resident',
  targetSiteId: 'example',
  runtime: 'narada-agent-runtime-server',
  workspaceRoot: 'D:/code/example',
  authority: 'local',
  mcpScope: 'local-site',
  enableNativeShell: false,
  launchSessionId: 'launch-1',
  waitForEnter: true,
};

describe('workspace launch command specifications', () => {
  it('keeps executable and arguments separate until argv rendering', () => {
    const runtime = workspaceLaunchRuntimeCommandSpec(options, 'execute');
    expect(runtime).toEqual(expect.objectContaining({ executable: 'narada' }));
    expect(runtime.args).toEqual(expect.arrayContaining(['operator-surface', 'runtime', 'start', 'agent-cli', '--exec', '--format', 'human']));
    expect(workspaceLaunchCommandArgv(runtime)[0]).toBe('narada');
  });

  it('composes pnpm and node launch specs without losing runtime arguments', () => {
    const runtime = workspaceLaunchRuntimeCommandSpec(options, 'dry-run');
    const pnpm = workspaceLaunchPnpmNaradaCommandSpec('D:/code/narada', runtime);
    const node = workspaceLaunchNodeNaradaCommandSpec('D:/code/narada', runtime);
    const smoke = workspaceLaunchSmokeCommandSpec(runtime);

    expect(pnpm.executable).toBe('pnpm');
    expect(workspaceLaunchCommandArgv(pnpm)).toEqual(expect.arrayContaining(['--dir', 'D:/code/narada', 'exec', 'narada', '--dry-run', '--format', 'json']));
    expect(node.executable).toMatch(/node(?:\.exe)?$/i);
    expect(workspaceLaunchCommandArgv(node)).toEqual(expect.arrayContaining(['--dry-run', '--format', 'json']));
    expect(workspaceLaunchCommandArgv(smoke)[0]).toBe('narada');
  });
});
