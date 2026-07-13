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
  | 'launcher'
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
    if (surface.availability !== 'available' || route.availability !== 'available' || !route.navigationKey || keys.has(route.navigationKey)) {
      return [];
    }
    keys.add(route.navigationKey);
    return [{ key: route.navigationKey, label: route.label, href: route.path, current: current === route.navigationKey }];
  }));
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

export function resolveOperatorConsoleRoute(
  pathname: string,
  search = '',
): OperatorConsoleRoute {
  const path = normalizedPathname(pathname);
  const query = new URLSearchParams(search);
  const siteId = query.get('site') || undefined;

  const matched = findOperatorSurfaceRoute(path);
  if (matched?.surface.id === 'site-registry') {
    if (matched.route.id === 'sites') {
      return {
        kind: 'site-registry',
        path,
        ...(siteId ? { siteId } : {}),
      };
    }
    if (matched.route.id === 'add') {
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
  if (matched?.surface.id === 'launcher') {
    return { kind: 'launcher', path };
  }
  if (matched?.surface.id === 'agent-sessions') {
    return { kind: 'agent-sessions', path };
  }
  if (matched?.surface.id === 'artifacts') {
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
