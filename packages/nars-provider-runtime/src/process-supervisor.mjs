import { runHiddenPostureCommandSync, spawnHiddenPostureProcess } from '@narada2/process-launch-posture';

const ownedProcessRegistry = new Set();
const cleanupTargets = new WeakSet();

function isLiveProcess(child) {
  return child && !child.killed && child.exitCode === null && child.signalCode === null;
}

function windowsProcessTreeKillArgs(pid) {
  return ['/PID', String(pid), '/T', '/F'];
}

function defaultHiddenSpawnSync(command, args, options) {
  return runHiddenPostureCommandSync(command, args, { ...options, posture: 'governed_command_execution' });
}

function terminateWindowsProcessTree(pid, { spawnSyncFn = defaultHiddenSpawnSync } = {}) {
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
  const spawnSyncFn = options.spawnSyncFn ?? defaultHiddenSpawnSync;
  const owner = options.owner ?? 'carrier-runtime';
  const registry = options.registry ?? ownedProcessRegistry;
  const processTarget = options.processTarget ?? process;
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

  const ownedProcess = {
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

  if (options.registerForProcessExit !== false) {
    registerOwnedProcess(ownedProcess, { registry, processTarget });
  }

  return ownedProcess;
}

function registerOwnedProcess(ownedProcess, { registry = ownedProcessRegistry, processTarget = process } = {}) {
  if (!ownedProcess?.child) return;
  registry.add(ownedProcess);
  const unregister = () => registry.delete(ownedProcess);
  ownedProcess.child.once?.('exit', unregister);
  ownedProcess.child.once?.('close', unregister);
  ownedProcess.child.once?.('error', unregister);
  installOwnedProcessExitCleanup({ registry, processTarget });
}

function installOwnedProcessExitCleanup({ registry = ownedProcessRegistry, processTarget = process } = {}) {
  if (!processTarget?.once || cleanupTargets.has(processTarget)) return;
  cleanupTargets.add(processTarget);
  processTarget.once('exit', () => terminateOwnedProcessRegistry('process_exit', { registry }));
}

function terminateOwnedProcessRegistry(reason = 'process_exit', { registry = ownedProcessRegistry } = {}) {
  const owners = [...registry];
  registry.clear();
  for (const owner of owners) {
    owner.terminateTree?.(reason);
  }
  return { reason, attempted: owners.length };
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
  terminateOwnedProcessRegistry,
  spawnOwnedProcess,
  terminateWindowsProcessTree,
  windowsProcessTreeKillArgs,
};
