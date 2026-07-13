import { runHiddenPostureCommandSync, spawnHiddenPostureProcess } from '@narada2/process-launch-posture';
import { createNarsOwnedProcessStateMachine } from './owned-process-state.mjs';

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
  const lifecycle = createNarsOwnedProcessStateMachine({
    onTransition: options.onStateTransition,
  });
  lifecycle.transition('running', { owner, pid: child?.pid ?? null });

  const transitionIfLive = (nextState, evidence = {}) => {
    if (lifecycle.state === nextState) return;
    if (lifecycle.state === 'released') return;
    lifecycle.transition(nextState, evidence);
  };

  const markExited = (evidence = {}) => {
    if (lifecycle.state === 'running' || lifecycle.state === 'terminating') transitionIfLive('exited', evidence);
  };

  const markFailed = (evidence = {}) => {
    if (lifecycle.state === 'running' || lifecycle.state === 'terminating' || lifecycle.state === 'created') {
      transitionIfLive('failed', evidence);
    }
  };

  const markReleased = (evidence = {}) => {
    if (lifecycle.state === 'exited' || lifecycle.state === 'failed' || lifecycle.state === 'created') {
      transitionIfLive('released', evidence);
    }
  };

  const terminateTree = (reason = 'unspecified') => {
    if (!child || terminated) return { owner, reason, attempted: false, status: null, error: null };
    terminated = true;
    transitionIfLive('terminating', { reason, mode: 'tree' });
    let treeResult = { attempted: false, status: null, error: null };
    if (platform === 'win32') {
      treeResult = terminateWindowsProcessTree(child.pid, { spawnSyncFn });
    }
    if (isLiveProcess(child)) {
      try {
        child.kill();
      } catch (error) {
        markFailed({ reason, error: String(error instanceof Error ? error.message : error) });
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
    get state() {
      return lifecycle.state;
    },
    get lifecycleState() {
      return lifecycle.state;
    },
    get stateHistory() {
      return lifecycle.history;
    },
    get pid() {
      return child?.pid ?? null;
    },
    terminate: (reason = 'unspecified') => {
      if (!isLiveProcess(child)) return { owner, reason, attempted: false, status: null, error: null };
      transitionIfLive('terminating', { reason, mode: 'process' });
      try {
        child.kill();
        return { owner, reason, attempted: true, status: null, error: null };
      } catch (error) {
        markFailed({ reason, error: String(error instanceof Error ? error.message : error) });
        return { owner, reason, attempted: true, status: null, error: String(error instanceof Error ? error.message : error) };
      }
    },
    terminateTree,
    transition: (nextState, evidence = {}) => lifecycle.transition(nextState, evidence),
  };

  if (options.registerForProcessExit !== false) {
    registerOwnedProcess(ownedProcess, { registry, processTarget });
  }

  return ownedProcess;
}

function registerOwnedProcess(ownedProcess, { registry = ownedProcessRegistry, processTarget = process } = {}) {
  if (!ownedProcess?.child) return;
  registry.add(ownedProcess);
  const unregister = (event = 'child_closed') => {
    registry.delete(ownedProcess);
    const evidence = { reason: event };
    if (event === 'error') {
      if (['created', 'running', 'terminating'].includes(ownedProcess.state)) ownedProcess.transition?.('failed', evidence);
    } else if (['running', 'terminating'].includes(ownedProcess.state)) {
      ownedProcess.transition?.('exited', evidence);
    }
    if (['created', 'exited', 'failed'].includes(ownedProcess.state)) ownedProcess.transition?.('released', evidence);
  };
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
