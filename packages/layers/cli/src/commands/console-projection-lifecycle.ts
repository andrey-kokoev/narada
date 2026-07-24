import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import {
  attachOperatorRouter,
  readOperatorRouterAdminRoutes,
  unregisterOperatorRoute,
  type OperatorRouterRouteRegistration,
} from '@narada2/operator-router';
import { workspaceLaunchProcessIsAlive, workspaceLaunchReadProcessCommandLine } from './workspace-launch-process.js';

const DEFAULT_STOP_TIMEOUT_MS = 5_000;

export type ConsoleProjectionStopStatus = 'not_running' | 'stopped' | 'stale_route_removed';

export interface ConsoleProjectionStopOptions {
  host?: string;
  port?: number;
  state_root?: string;
  timeout_ms?: number;
}

export interface ConsoleProjectionStopResult {
  status: ConsoleProjectionStopStatus;
  router_url: string | null;
  route_id: string;
  pid: number | null;
  detail: string;
}

function operatorConsoleRoute(
  routes: readonly OperatorRouterRouteRegistration[],
): OperatorRouterRouteRegistration | null {
  return routes.find((route) => route.route_id === 'operator-console' && route.route_class === 'operator-console') ?? null;
}

function isOperatorConsoleProcess(commandLine: string | null): boolean {
  if (!commandLine) return false;
  const normalized = commandLine.replace(/[\\/]+/g, '/').toLowerCase();
  return normalized.includes('narada')
    && normalized.includes('console')
    && normalized.includes('serve');
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (workspaceLaunchProcessIsAlive(pid) && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  return !workspaceLaunchProcessIsAlive(pid);
}

async function terminateOperatorConsoleProcess(pid: number, timeoutMs: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    if (!workspaceLaunchProcessIsAlive(pid)) return;
  }
  if (await waitForProcessExit(pid, timeoutMs)) return;

  if (process.platform === 'win32') {
    try {
      runGovernedCommandSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // The process may have exited between the liveness check and taskkill.
    }
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // The process may have exited between the liveness check and SIGKILL.
    }
  }
  if (!(await waitForProcessExit(pid, timeoutMs))) throw new Error(`operator_console_process_stop_timeout:${pid}`);
}

export async function stopOperatorConsoleProjection(
  options: ConsoleProjectionStopOptions = {},
): Promise<ConsoleProjectionStopResult> {
  const router = await attachOperatorRouter({
    host: options.host,
    port: options.port,
    state_root: options.state_root,
  });
  if (!router) {
    return {
      status: 'not_running',
      router_url: null,
      route_id: 'operator-console',
      pid: null,
      detail: 'Operator Console projection is not running.',
    };
  }

  const admin = {
    url: router.url,
    registration_token: router.registration_token,
    state_root: router.state_root ?? options.state_root,
  };
  const inventory = await readOperatorRouterAdminRoutes(admin);
  const route = operatorConsoleRoute(inventory.routes);
  if (!route) {
    return {
      status: 'not_running',
      router_url: router.url,
      route_id: 'operator-console',
      pid: null,
      detail: 'Operator Console projection is not registered.',
    };
  }

  const pid = route.process_evidence.pid;
  if (pid === null || route.owner_id !== `operator-console:${pid}`) {
    throw new Error('operator_console_process_identity_missing');
  }

  if (workspaceLaunchProcessIsAlive(pid)) {
    const commandLine = workspaceLaunchReadProcessCommandLine(pid);
    if (!commandLine) {
      throw new Error(`operator_console_process_identity_unverified:${pid}`);
    }
    if (!isOperatorConsoleProcess(commandLine)) {
      // The route's PID may have been reused after the original console exited
      // (including by this restart command itself).  Never kill an unrelated
      // process; remove only the stale route and let restart create a fresh
      // owned projection.
      await unregisterOperatorRoute(admin, route.route_id, {
        owner_id: route.owner_id,
        instance_nonce: route.process_evidence.instance_nonce,
      });
      return {
        status: 'stale_route_removed',
        router_url: router.url,
        route_id: route.route_id,
        pid,
        detail: `Removed stale Operator Console route for PID ${pid}; the live process identity was not the registered console.`,
      };
    }
    await terminateOperatorConsoleProcess(pid, options.timeout_ms ?? DEFAULT_STOP_TIMEOUT_MS);
    await unregisterOperatorRoute(admin, route.route_id, {
      owner_id: route.owner_id,
      instance_nonce: route.process_evidence.instance_nonce,
    });
    return {
      status: 'stopped',
      router_url: router.url,
      route_id: route.route_id,
      pid,
      detail: `Stopped Operator Console projection process ${pid}.`,
    };
  }

  await unregisterOperatorRoute(admin, route.route_id, {
    owner_id: route.owner_id,
    instance_nonce: route.process_evidence.instance_nonce,
  });
  return {
    status: 'stale_route_removed',
    router_url: router.url,
    route_id: route.route_id,
    pid,
    detail: `Removed stale Operator Console route for exited process ${pid}.`,
  };
}
