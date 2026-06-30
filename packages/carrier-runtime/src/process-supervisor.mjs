import { spawnSync } from 'node:child_process';
import { spawnHiddenPostureProcess } from '@narada2/process-launch-posture';

function isLiveProcess(child) {
  return child && !child.killed && child.exitCode === null && child.signalCode === null;
}

function windowsProcessTreeKillArgs(pid) {
  return ['/PID', String(pid), '/T', '/F'];
}

function terminateWindowsProcessTree(pid, { spawnSyncFn = spawnSync } = {}) {
  if (!pid) return { attempted: false, status: null, error: 'missing_pid' };
  const result = spawnSyncFn('taskkill.exe', windowsProcessTreeKillArgs(pid), {
    stdio: 'ignore',
    windowsHide: true,
  });
  return {
    attempted: true,
    status: typeof result?.status === 'number' ? result.status : null,
    error: result?.error ? String(result.error.message ?? result.error) : null,
  };
}

function createOwnedProcess(child, options = {}) {
  const platform = options.platform ?? process.platform;
  const spawnSyncFn = options.spawnSyncFn ?? spawnSync;
  const owner = options.owner ?? 'carrier-runtime';
  let terminated = false;

  const terminateTree = (reason = 'unspecified') => {
    if (!child || terminated) return { owner, reason, attempted: false, status: null, error: null };
    terminated = true;
    let treeResult = { attempted: false, status: null, error: null };
    if (platform === 'win32') {
      treeResult = terminateWindowsProcessTree(child.pid, { spawnSyncFn });
    }
    if (isLiveProcess(child)) {
      try {
        child.kill();
      } catch (error) {
        return {
          owner,
          reason,
          attempted: treeResult.attempted,
          status: treeResult.status,
          error: treeResult.error ?? String(error instanceof Error ? error.message : error),
        };
      }
    }
    return { owner, reason, attempted: treeResult.attempted, status: treeResult.status, error: treeResult.error };
  };

  return {
    child,
    get pid() {
      return child?.pid ?? null;
    },
    terminate: (reason = 'unspecified') => {
      if (!isLiveProcess(child)) return { owner, reason, attempted: false, status: null, error: null };
      try {
        child.kill();
        return { owner, reason, attempted: true, status: null, error: null };
      } catch (error) {
        return { owner, reason, attempted: true, status: null, error: String(error instanceof Error ? error.message : error) };
      }
    },
    terminateTree,
  };
}

function spawnOwnedProcess(command, args = [], spawnOptions = {}, supervisorOptions = {}) {
  const child = spawnHiddenPostureProcess(command, args, {
    ...spawnOptions,
    posture: supervisorOptions.posture ?? 'provider_subprocess',
  });
  return createOwnedProcess(child, supervisorOptions);
}

export {
  createOwnedProcess,
  spawnOwnedProcess,
  terminateWindowsProcessTree,
  windowsProcessTreeKillArgs,
};
