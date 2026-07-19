import type { RegistryManagementOperation } from '@narada2/site-registry-contract';
import {
  findOperatorSurfaceRoute,
  projectOperatorSurfaceNavigation,
  type OperatorSurfaceRouteTarget,
  type OperatorWorkspaceRouteDirectory,
  type OperatorSurfaceNavigationKey,
} from '@narada2/operator-console-contract';
import type { OperatorSurfaceNavItem } from '@narada2/ui-vue';

export type OperatorConsoleRouteKind =
  | 'site-registry'
  | 'site-registry-add'
  | 'site-registry-manage'
  | 'site-agents'
  | 'launcher'
  | 'onboarding'
  | 'agent-sessions'
  | 'artifacts'
  | 'not-found';

export interface OperatorConsoleRoute {
  kind: OperatorConsoleRouteKind;
  path: string;
  siteId?: string;
  operation?: RegistryManagementOperation;
}

export function operatorConsoleNavigationFromDirectory(
  directory: OperatorWorkspaceRouteDirectory,
  current: OperatorConsoleNavigationKey,
): OperatorConsoleNavItem[] {
  const keys = new Set<OperatorConsoleNavigationKey>();
  return directory.surfaces.flatMap((surface) => surface.projectedRoutes.flatMap((route) => {
    if (surface.availability !== 'available' || route.availability !== 'available' || !route.navigationKey) {
      return [];
    }
    if (keys.has(route.navigationKey)) {
      throw new Error(`operator_workspace_navigation_key_duplicate:${route.navigationKey}`);
    }
    keys.add(route.navigationKey);
    return [{ key: route.navigationKey, label: route.label, href: route.path, current: current === route.navigationKey }];
  }));
}

export function operatorConsoleNavigationHref(
  directory: OperatorWorkspaceRouteDirectory | null | undefined,
  key: OperatorConsoleNavigationKey,
  fallback: string,
): string {
  if (!directory) return fallback;
  for (const surface of directory.surfaces) {
    if (surface.availability !== 'available') continue;
    const route = surface.projectedRoutes.find((candidate) =>
      candidate.availability === 'available' && candidate.navigationKey === key);
    if (route) return route.path;
  }
  return fallback;
}

export function findOperatorRouteTarget(
  directory: OperatorWorkspaceRouteDirectory,
  target: OperatorSurfaceRouteTarget,
): string | null {
  for (const surface of directory.surfaces) {
    const route = surface.projectedRoutes.find((candidate) =>
      candidate.availability === 'available'
      && candidate.target?.kind === target.kind
      && candidate.target.id === target.id);
    if (route) return route.path;
  }
  return null;
}

export type SiteRegistryNavigationKey = 'sites' | 'add' | 'manage';
export type OperatorConsoleNavigationKey = OperatorSurfaceNavigationKey;
export interface OperatorConsoleNavItem extends Omit<OperatorSurfaceNavItem, 'key'> {
  key: OperatorConsoleNavigationKey;
}

function normalizedPathname(pathname: string): string {
  const value = pathname.trim() || '/';
  const withoutTrailingSlash = value.replace(/\/+$/, '');
  return withoutTrailingSlash || '/';
}

function managementOperation(value: string | null): RegistryManagementOperation | undefined {
  return value === 'add'
    || value === 'edit'
    || value === 'retire'
    || value === 'restore'
    || value === 'purge'
    ? value
    : undefined;
}

interface MatchedOperatorRoute {
  surfaceId: string;
  routeId: string;
}

function findDirectoryRoute(
  directory: OperatorWorkspaceRouteDirectory,
  path: string,
): MatchedOperatorRoute | undefined {
  for (const surface of directory.surfaces) {
    if (surface.availability !== 'available') continue;
    const route = surface.projectedRoutes.find((candidate) =>
      candidate.availability === 'available'
      && normalizedPathname(candidate.path) === path);
    if (route) return { surfaceId: surface.id, routeId: route.id };
  }
  return undefined;
}

export function resolveOperatorConsoleRoute(
  pathname: string,
  search = '',
  directory?: OperatorWorkspaceRouteDirectory,
): OperatorConsoleRoute {
  const path = normalizedPathname(pathname);
  const query = new URLSearchParams(search);
  const siteId = query.get('site') || undefined;

  const matched = directory
    ? findDirectoryRoute(directory, path)
    : (() => {
      const staticMatch = findOperatorSurfaceRoute(path);
      return staticMatch
        ? { surfaceId: staticMatch.surface.id, routeId: staticMatch.route.id }
        : undefined;
    })();
  if (matched?.surfaceId === 'site-agents') {
    return { kind: 'site-agents', path };
  }
  if (matched?.surfaceId === 'site-registry') {
    if (matched.routeId === 'sites') {
      return {
        kind: 'site-registry',
        path,
        ...(siteId ? { siteId } : {}),
      };
    }
    if (matched.routeId === 'add') {
      return { kind: 'site-registry-add', path };
    }
    const operation = managementOperation(query.get('operation'));
    return {
      kind: 'site-registry-manage',
      path,
      ...(siteId ? { siteId } : {}),
      ...(operation ? { operation } : {}),
    };
  }
  if (matched?.surfaceId === 'launcher') {
    return { kind: 'launcher', path };
  }
  if (matched?.surfaceId === 'onboarding') {
    return { kind: 'onboarding', path };
  }
  if (matched?.surfaceId === 'agent-sessions') {
    return { kind: 'agent-sessions', path };
  }
  if (matched?.surfaceId === 'artifacts') {
    return { kind: 'artifacts', path };
  }
  return { kind: 'not-found', path };
}

export function operatorConsoleNavigation(
  current: OperatorConsoleNavigationKey,
): OperatorConsoleNavItem[] {
  return projectOperatorSurfaceNavigation().map((item) => ({
    ...item,
    current: current === item.key,
  }));
}

export function siteRegistryNavigation(
  current: SiteRegistryNavigationKey,
): OperatorConsoleNavItem[] {
  return operatorConsoleNavigation(current);
}
