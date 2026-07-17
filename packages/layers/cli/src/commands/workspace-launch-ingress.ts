import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { executeOperatorProjectionOpenRequest } from '@narada2/process-launch-posture';
import {
  DEFAULT_OPERATOR_ROUTER_PORT,
  ensureOperatorRouter,
  readOperatorRouterRoutes,
  type EnsureOperatorRouterOptions,
  type EnsureOperatorRouterResult,
} from '@narada2/operator-router';
import {
  OPERATOR_CONSOLE_LAUNCH_PATH,
  OPERATOR_WORKSPACE_ROUTE_DIRECTORY_PATH,
  OPERATOR_WORKSPACE_ROUTE_DIRECTORY_SCHEMA,
  type OperatorWorkspaceRouteDirectory,
} from '@narada2/operator-console-contract';
import {
  workspaceLaunchUiSessionRoute,
  workspaceLaunchUserSiteRoot,
} from './workspace-launch-session-store.js';
import type { WorkspaceLaunchPlanOptions } from './workspace-launch-types.js';
import type { WorkspaceLaunchUiPortPolicy } from './workspace-launch-ui-server.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface WorkspaceLaunchUiIngress {
  url: string;
  direct_url: string;
  router_url: string | null;
  stable_url: string | null;
  ingress_mode: 'operator-router' | 'diagnostic';
  reason: string | null;
}

export interface ResolveWorkspaceLaunchUiIngressOptions {
  uiSessionId: string;
  directUrl: string;
  host?: string;
  port?: number;
  ensureRouter?: (options: EnsureOperatorRouterOptions) => Promise<EnsureOperatorRouterResult>;
  readRoutes?: typeof readOperatorRouterRoutes;
  readWorkspaceRouteDirectory?: typeof readOperatorWorkspaceRouteDirectory;
}

function boundedWorkspaceLaunchIngressError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const bounded = message.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 160);
  return `operator_router_unavailable:${bounded || 'unknown_error'}`;
}

function operatorRouterIngressUrl(routerUrl: string, uiSessionId: string): string {
  return `${routerUrl.replace(/\/+$/, '')}${workspaceLaunchUiSessionRoute(uiSessionId)}`;
}

export async function readOperatorWorkspaceRouteDirectory(options: {
  url: string;
  fetch_fn?: typeof fetch;
  timeout_ms?: number;
}): Promise<OperatorWorkspaceRouteDirectory> {
  const timeoutMs = options.timeout_ms ?? 3_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw new Error('operator_workspace_route_directory_timeout_invalid');
  }
  const response = await (options.fetch_fn ?? fetch)(
    `${options.url.replace(/\/+$/, '')}${OPERATOR_WORKSPACE_ROUTE_DIRECTORY_PATH}`,
    { signal: AbortSignal.timeout(timeoutMs) },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isOperatorWorkspaceRouteDirectory(payload)) {
    throw new Error(`operator_workspace_route_directory_read_failed:${response.status}`);
  }
  return payload;
}

function isOperatorWorkspaceRouteDirectory(value: unknown): value is OperatorWorkspaceRouteDirectory {
  if (!isRecord(value)
    || value.schema !== OPERATOR_WORKSPACE_ROUTE_DIRECTORY_SCHEMA
    || !Array.isArray(value.surfaces)) return false;
  return value.surfaces.every((surface) => {
    if (!isRecord(surface)
      || typeof surface.id !== 'string'
      || !['available', 'unavailable', 'planned'].includes(String(surface.availability))
      || !Array.isArray(surface.projectedRoutes)) return false;
    return surface.projectedRoutes.every((route) => isRecord(route)
      && typeof route.id === 'string'
      && typeof route.path === 'string'
      && (route.kind === 'page' || route.kind === 'workflow')
      && typeof route.label === 'string'
      && ['available', 'unavailable', 'planned'].includes(String(route.availability))
      && typeof route.projectedDetail === 'string');
  });
}

function workspaceLaunchRouteDirectoryHealthy(directory: OperatorWorkspaceRouteDirectory): boolean {
  const launcher = directory.surfaces.find((surface) => surface.id === 'launcher');
  return launcher?.availability === 'available'
    && launcher.projectedRoutes.some((route) => route.id === 'launcher'
      && route.path === OPERATOR_CONSOLE_LAUNCH_PATH
      && route.availability === 'available');
}

export async function resolveWorkspaceLaunchUiIngress(
  options: ResolveWorkspaceLaunchUiIngressOptions,
): Promise<WorkspaceLaunchUiIngress> {
  const directUrl = options.directUrl;
  let routerUrl: string | null = null;
  try {
    const ensureRouter = options.ensureRouter ?? ensureOperatorRouter;
    const readRoutes = options.readRoutes ?? readOperatorRouterRoutes;
    const readWorkspaceRouteDirectory = options.readWorkspaceRouteDirectory ?? readOperatorWorkspaceRouteDirectory;
    const router = await ensureRouter({
      host: options.host ?? '127.0.0.1',
      port: options.port ?? DEFAULT_OPERATOR_ROUTER_PORT,
    });
    routerUrl = router.url;
    const routes = await readRoutes({ url: router.url });
    const consoleProjection = routes.routes.find((route) => route.route_id === 'operator-console');
    const consoleProjectionHealthy = consoleProjection?.route_class === 'operator-console'
      && consoleProjection.public_path === '/'
      && consoleProjection.route_mode === 'prefix'
      && consoleProjection.state === 'healthy';
    if (consoleProjectionHealthy) {
      const workspaceRouteDirectory = await readWorkspaceRouteDirectory({ url: router.url });
      if (!workspaceLaunchRouteDirectoryHealthy(workspaceRouteDirectory)) {
        return {
          url: directUrl,
          direct_url: directUrl,
          router_url: router.url,
          stable_url: null,
          ingress_mode: 'diagnostic',
          reason: 'operator_workspace_launcher_route_unavailable',
        };
      }
      const stableUrl = operatorRouterIngressUrl(router.url, options.uiSessionId);
      return {
        url: stableUrl,
        direct_url: directUrl,
        router_url: router.url,
        stable_url: stableUrl,
        ingress_mode: 'operator-router',
        reason: null,
      };
    }
    return {
      url: directUrl,
      direct_url: directUrl,
      router_url: router.url,
      stable_url: null,
      ingress_mode: 'diagnostic',
      reason: 'operator_console_projection_unavailable',
    };
  } catch (error) {
    return {
      url: directUrl,
      direct_url: directUrl,
      router_url: routerUrl,
      stable_url: null,
      ingress_mode: 'diagnostic',
      reason: boundedWorkspaceLaunchIngressError(error),
    };
  }
}

export function requestWorkspaceLaunchSelectionUiProjectionOpen(url: string): void {
  void executeOperatorProjectionOpenRequest({
    projection_kind: 'browser_url',
    target_ref: url,
    purpose: 'workspace_launch_interactive_selection_ui',
    caller: { package: '@narada2/cli', command: 'launcher workspace-launch', module: 'commands/launcher' },
    mode: 'execute',
    policy: { allow_visible_host_effect: true },
  }).catch(() => undefined);
}

interface WorkspaceLaunchUiPortPolicyRecord {
  LauncherUiPort?: number;
  LauncherUiPortFallback?: boolean;
  launcherUiPort?: number;
  launcherUiPortFallback?: boolean;
}

const WORKSPACE_LAUNCH_UI_DEFAULT_PORT = 47320;

function workspaceLaunchUiPolicyPath(): string {
  return join(resolve(workspaceLaunchUserSiteRoot()), 'config', 'launch', 'workspace-launch.psd1');
}

function parseWorkspaceLaunchUiPort(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : null;
}

function parseWorkspaceLaunchUiPortFallback(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase().replace(/^\$/, '');
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return null;
}

function readWorkspaceLaunchUiPortPolicyConfig(): WorkspaceLaunchUiPortPolicyRecord | null {
  const path = workspaceLaunchUiPolicyPath();
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  const portMatch = text.match(/LauncherUiPort\s*=\s*([0-9]+)/i);
  const fallbackMatch = text.match(/LauncherUiPortFallback\s*=\s*(\$true|\$false|true|false|1|0|yes|no|y|n)/i);
  return {
    LauncherUiPort: parseWorkspaceLaunchUiPort(portMatch ? portMatch[1] : null) ?? undefined,
    LauncherUiPortFallback: parseWorkspaceLaunchUiPortFallback(fallbackMatch ? fallbackMatch[1] : null) ?? undefined,
  };
}

export function resolveWorkspaceLaunchUiPortPolicy(options: WorkspaceLaunchPlanOptions): WorkspaceLaunchUiPortPolicy {
  const config = readWorkspaceLaunchUiPortPolicyConfig();
  const explicitPort = parseWorkspaceLaunchUiPort(options.launcherUiPort);
  const explicitFallback = typeof options.launcherUiPortFallback === 'boolean' ? options.launcherUiPortFallback : null;
  const configPort = config ? parseWorkspaceLaunchUiPort(config.LauncherUiPort ?? config.launcherUiPort) : null;
  const configFallback = config ? parseWorkspaceLaunchUiPortFallback(config.LauncherUiPortFallback ?? config.launcherUiPortFallback) : null;

  const port = explicitPort ?? configPort ?? WORKSPACE_LAUNCH_UI_DEFAULT_PORT;
  const fallbackToEphemeral = explicitFallback ?? configFallback ?? false;
  const source: WorkspaceLaunchUiPortPolicy['source'] = explicitPort !== null ? 'explicit' : (configPort !== null ? 'config' : 'default');
  return { port, fallbackToEphemeral, source };
}

