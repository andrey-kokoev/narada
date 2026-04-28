import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  makeRouteAddressRecord,
  readRoutingRegistry,
  resolveRoute,
  routingRegistryPath,
  writeRoutingRegistry,
} from '../lib/routing-addressing-registry.js';

export interface RoutingAddOptions {
  cwd?: string;
  targetKind?: string;
  targetRef?: string;
  authorityLocus?: string;
  addressKind?: string;
  addressRef?: string;
  transport?: string;
  capabilityKind?: string;
  priority?: number;
  inactive?: boolean;
  fallbackTarget?: string;
  evidenceRef?: string;
  by?: string;
  format?: string;
}

export interface RoutingListOptions {
  cwd?: string;
  targetKind?: string;
  targetRef?: string;
  transport?: string;
  active?: string;
  limit?: number;
  format?: string;
}

export interface RoutingResolveOptions {
  cwd?: string;
  targetKind?: string;
  targetRef?: string;
  transport?: string;
  format?: string;
}

export interface RoutingExplainOptions {
  cwd?: string;
  routeId?: string;
  format?: string;
}

function requireOption(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function normalizeError(error: unknown): { exitCode: ExitCode; result: unknown } {
  const message = error instanceof Error ? error.message : String(error);
  return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: message } };
}

export async function routingAddCommand(
  options: RoutingAddOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const record = makeRouteAddressRecord({
      targetKind: requireOption(options.targetKind, '--target-kind'),
      targetRef: requireOption(options.targetRef, '--target-ref'),
      authorityLocus: requireOption(options.authorityLocus, '--authority-locus'),
      addressKind: requireOption(options.addressKind, '--address-kind'),
      addressRef: requireOption(options.addressRef, '--address-ref'),
      transport: requireOption(options.transport, '--transport'),
      capabilityKind: options.capabilityKind,
      priority: options.priority,
      active: options.inactive !== true,
      fallbackTarget: options.fallbackTarget,
      evidenceRef: options.evidenceRef,
      createdBy: requireOption(options.by, '--by'),
    });
    const registry = await readRoutingRegistry(cwd);
    registry.routes.push(record);
    const path = await writeRoutingRegistry(cwd, registry);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: true,
        registry_path: path,
        route: record,
        secret_values_stored: false,
      },
    };
  } catch (error) {
    return normalizeError(error);
  }
}

export async function routingListCommand(
  options: RoutingListOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  const limit = options.limit ?? 20;
  const activeFilter = options.active === 'true' ? true : options.active === 'false' ? false : undefined;
  const registry = await readRoutingRegistry(cwd);
  const routes = registry.routes
    .filter((route) => !options.targetKind || route.target_kind === options.targetKind)
    .filter((route) => !options.targetRef || route.target_ref === options.targetRef)
    .filter((route) => !options.transport || route.transport === options.transport)
    .filter((route) => activeFilter === undefined || route.active === activeFilter)
    .sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at))
    .slice(0, limit);
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      registry_path: routingRegistryPath(cwd),
      count: routes.length,
      limit,
      routes,
    },
  };
}

export async function routingResolveCommand(
  options: RoutingResolveOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const targetKind = requireOption(options.targetKind, '--target-kind');
  const targetRef = requireOption(options.targetRef, '--target-ref');
  const cwd = options.cwd ?? '.';
  const registry = await readRoutingRegistry(cwd);
  const resolved = resolveRoute(registry.routes, targetKind, targetRef, options.transport);
  return {
    exitCode: resolved.selected ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: {
      status: resolved.selected ? 'success' : 'not_found',
      mutation_performed: false,
      registry_path: routingRegistryPath(cwd),
      selected: resolved.selected,
      alternatives: resolved.alternatives,
      explanation: resolved.selected
        ? `Selected active route ${resolved.selected.route_id} by priority for ${targetKind}:${targetRef}.`
        : `No active route found for ${targetKind}:${targetRef}.`,
    },
  };
}

export async function routingExplainCommand(
  options: RoutingExplainOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const routeId = requireOption(options.routeId, '<route-id>');
  const cwd = options.cwd ?? '.';
  const registry = await readRoutingRegistry(cwd);
  const route = registry.routes.find((entry) => entry.route_id === routeId);
  if (!route) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Route not found: ${routeId}` },
    };
  }
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      registry_path: routingRegistryPath(cwd),
      route,
      admissibility_note: route.active
        ? 'Route is active. Execution still requires matching capability grant and destination crossing law.'
        : 'Route is inactive and must not be selected for execution.',
      secret_values_stored: false,
    },
  };
}
