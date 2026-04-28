import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface RouteAddressRecord {
  route_id: string;
  target_kind: string;
  target_ref: string;
  authority_locus: string;
  address_kind: string;
  address_ref: string;
  transport: string;
  capability_kind: string | null;
  priority: number;
  active: boolean;
  fallback_target: string | null;
  evidence_ref: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RoutingAddressingRegistry {
  registry_kind: 'routing_addressing_registry';
  registry_version: 1;
  routes: RouteAddressRecord[];
}

export function routingRegistryPath(cwd: string): string {
  return join(resolve(cwd), '.ai', 'routing-addressing-registry.json');
}

function emptyRegistry(): RoutingAddressingRegistry {
  return {
    registry_kind: 'routing_addressing_registry',
    registry_version: 1,
    routes: [],
  };
}

export async function readRoutingRegistry(cwd: string): Promise<RoutingAddressingRegistry> {
  const path = routingRegistryPath(cwd);
  if (!existsSync(path)) return emptyRegistry();
  const parsed = JSON.parse(await readFile(path, 'utf8')) as RoutingAddressingRegistry;
  return {
    registry_kind: 'routing_addressing_registry',
    registry_version: 1,
    routes: Array.isArray(parsed.routes) ? parsed.routes : [],
  };
}

export async function writeRoutingRegistry(cwd: string, registry: RoutingAddressingRegistry): Promise<string> {
  const path = routingRegistryPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  await rename(tempPath, path);
  return path;
}

export function makeRouteAddressRecord(args: {
  targetKind: string;
  targetRef: string;
  authorityLocus: string;
  addressKind: string;
  addressRef: string;
  transport: string;
  capabilityKind?: string | null;
  priority?: number;
  active?: boolean;
  fallbackTarget?: string | null;
  evidenceRef?: string | null;
  createdBy: string;
  now?: Date;
}): RouteAddressRecord {
  const now = (args.now ?? new Date()).toISOString();
  return {
    route_id: `route_${randomUUID()}`,
    target_kind: args.targetKind,
    target_ref: args.targetRef,
    authority_locus: args.authorityLocus,
    address_kind: args.addressKind,
    address_ref: args.addressRef,
    transport: args.transport,
    capability_kind: args.capabilityKind ?? null,
    priority: args.priority ?? 100,
    active: args.active ?? true,
    fallback_target: args.fallbackTarget ?? null,
    evidence_ref: args.evidenceRef ?? null,
    created_by: args.createdBy,
    created_at: now,
    updated_at: now,
  };
}

export function resolveRoute(
  routes: RouteAddressRecord[],
  targetKind: string,
  targetRef: string,
  transport?: string,
): { selected: RouteAddressRecord | null; alternatives: RouteAddressRecord[] } {
  const candidates = routes
    .filter((route) => route.target_kind === targetKind)
    .filter((route) => route.target_ref === targetRef)
    .filter((route) => !transport || route.transport === transport)
    .sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
  const selected = candidates.find((route) => route.active) ?? null;
  const alternatives = candidates.filter((route) => route.route_id !== selected?.route_id);
  return { selected, alternatives };
}
