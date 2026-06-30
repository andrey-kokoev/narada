import { spawn, spawnSync } from 'node:child_process';

const HIDDEN_POSTURES = new Set([
  'browser_open',
  'provider_subprocess',
  'mcp_server',
  'governed_command_execution',
  'test_child',
]);

function browserOpenCommand(target, { platform = process.platform } = {}) {
  if (!target || typeof target !== 'string') throw new Error('browser_open_target_required');
  if (platform === 'win32') return { posture: 'browser_open', command: 'cmd.exe', args: ['/c', 'start', '', target] };
  if (platform === 'darwin') return { posture: 'browser_open', command: 'open', args: [target] };
  return { posture: 'browser_open', command: 'xdg-open', args: [target] };
}

function spawnHiddenPostureProcess(command, args, options = {}) {
  const { posture, spawnImpl = spawn, platform = process.platform, ...restOptions } = options;
  if (!HIDDEN_POSTURES.has(posture)) throw new Error(`hidden_process_posture_required: ${posture ?? 'missing'}`);
  const normalized = normalizeHiddenCommand(command, args, { platform });
  const spawnOptions = {
    ...restOptions,
    windowsHide: true,
  };
  return spawnImpl(normalized.command, normalized.args, spawnOptions);
}

function normalizeHiddenCommand(command, args = [], { platform = process.platform } = {}) {
  if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(String(command))) {
    return {
      command: process.env.ComSpec || process.env.COMSPEC || 'cmd.exe',
      args: ['/d', '/s', '/c', String(command), ...args],
    };
  }
  return { command, args };
}

function spawnProviderSubprocess(command, args = [], options = {}) {
  return spawnHiddenPostureProcess(command, args, { ...options, posture: 'provider_subprocess' });
}

function spawnMcpServer(command, args = [], options = {}) {
  return spawnHiddenPostureProcess(command, args, { ...options, posture: 'mcp_server' });
}

function runGovernedCommand(command, args = [], options = {}) {
  return spawnHiddenPostureProcess(command, args, { ...options, posture: 'governed_command_execution' });
}

function spawnTestChild(command, args = [], options = {}) {
  return spawnHiddenPostureProcess(command, args, { ...options, posture: 'test_child' });
}

function openBrowserUrl(target, { platform = process.platform, spawnImpl = spawn } = {}) {
  const plan = browserOpenCommand(target, { platform });
  return new Promise((resolve, reject) => {
    const child = spawnImpl(plan.command, plan.args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      resolve({
        ...plan,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        pid: typeof child.pid === 'number' ? child.pid : null,
      });
    });
    child.unref();
  });
}

function startOperatorTerminal(command, args = [], options = {}) {
  if (!command || typeof command !== 'string') throw new Error('operator_terminal_command_required');
  const { spawnSyncImpl = spawnSync, ...spawnOptions } = options;
  const stdio = spawnOptions.stdio ?? 'inherit';
  const result = spawnSyncImpl(command, args, {
    ...spawnOptions,
    stdio,
    windowsHide: false,
  });
  return {
    posture: 'operator_terminal',
    command,
    args,
    stdio,
    windowsHide: false,
    result,
  };
}

function startElevatedOrOperatorPrompt(command, args = [], options = {}) {
  const { reason, ...terminalOptions } = options;
  if (!reason || typeof reason !== 'string') throw new Error('elevated_or_operator_prompt_reason_required');
  return {
    ...startOperatorTerminal(command, args, terminalOptions),
    posture: 'elevated_or_operator_prompt',
  };
}

export {
  browserOpenCommand,
  normalizeHiddenCommand,
  openBrowserUrl,
  runGovernedCommand,
  spawnMcpServer,
  spawnProviderSubprocess,
  startOperatorTerminal,
  startElevatedOrOperatorPrompt,
  spawnTestChild,
  spawnHiddenPostureProcess,
};

