import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface RouteAddressRecord {
  route_id: string;
  target_kind: string;
  target_ref: string;
  authority_locus?: string;
  address_kind: string;
  address_ref: string;
  transport?: string;
  capability_kind?: string;
  active?: boolean;
  priority?: number;
}

export interface RoutingRegistry {
  routes: RouteAddressRecord[];
}

export async function readRoutingRegistry(siteRoot: string): Promise<RoutingRegistry> {
  const path = resolve(siteRoot, '.ai', 'routing-addressing-registry.json');
  if (!existsSync(path)) return { routes: [] };
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { routes?: RouteAddressRecord[] };
  return { routes: Array.isArray(parsed.routes) ? parsed.routes : [] };
}

export function resolveRoute(routes: RouteAddressRecord[], targetKind: string, targetRef?: string): RouteAddressRecord | null {
  const candidates = routes
    .filter((route) => route.active !== false)
    .filter((route) => route.target_kind === targetKind)
    .filter((route) => !targetRef || route.target_ref === targetRef)
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  return candidates[0] ?? null;
}

export function resolveRouteSelection(routes: RouteAddressRecord[], targetKind: string, targetRef?: string): { selected: RouteAddressRecord | null; alternatives: RouteAddressRecord[] } {
  const candidates = routes
    .filter((route) => route.active !== false)
    .filter((route) => route.target_kind === targetKind)
    .filter((route) => !targetRef || route.target_ref === targetRef)
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  return { selected: candidates[0] ?? null, alternatives: candidates.slice(1) };
}
