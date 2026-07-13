import type { RegistryManagementOperation } from '@narada2/site-registry-contract';
import type { OperatorSurfaceNavItem } from '@narada2/ui-vue';

export type OperatorConsoleRouteKind =
  | 'site-registry'
  | 'site-registry-add'
  | 'site-registry-manage'
  | 'launcher'
  | 'not-found';

export interface OperatorConsoleRoute {
  kind: OperatorConsoleRouteKind;
  path: string;
  siteId?: string;
  operation?: RegistryManagementOperation;
}

export type SiteRegistryNavigationKey = 'sites' | 'add' | 'manage';
export type OperatorConsoleNavigationKey = SiteRegistryNavigationKey | 'launcher';
export type OperatorConsoleNavItem = OperatorSurfaceNavItem;

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

  if (path === '/console/registry') {
    return {
      kind: 'site-registry',
      path,
      ...(siteId ? { siteId } : {}),
    };
  }
  if (path === '/console/registry/add') {
    return { kind: 'site-registry-add', path };
  }
  if (path === '/console/registry/manage') {
    const operation = managementOperation(query.get('operation'));
    return {
      kind: 'site-registry-manage',
      path,
      ...(siteId ? { siteId } : {}),
      ...(operation ? { operation } : {}),
    };
  }
  if (path === '/console/launch') {
    return { kind: 'launcher', path };
  }
  return { kind: 'not-found', path };
}

export function operatorConsoleNavigation(
  current: OperatorConsoleNavigationKey,
): OperatorConsoleNavItem[] {
  return [
    { key: 'sites', label: 'Sites', href: '/console/registry', current: current === 'sites' },
    { key: 'add', label: 'Add Site', href: '/console/registry/add', current: current === 'add' },
    { key: 'manage', label: 'Manage', href: '/console/registry/manage', current: current === 'manage' },
    { key: 'launcher', label: 'Launcher', href: '/console/launch', current: current === 'launcher' },
  ];
}

export function siteRegistryNavigation(
  current: SiteRegistryNavigationKey,
): OperatorConsoleNavItem[] {
  return operatorConsoleNavigation(current);
}
