import {
  createHostGatewayClient,
  openHostFleetRegistry,
  projectHostFleetOverview,
  refusal,
  resolveHostFleetRegistryDbPath,
  type HostFleetRegistryResult,
  type HostKey,
  type HostPlatform,
  type HostRecord,
  type HostRecordInput,
  type HostGatewayTransport,
} from '@narada2/host-fleet';
import type { Command } from 'commander';
import { directCommandAction, type CommanderOptionValues } from '../lib/command-wrapper.js';
import { emitCommandResult, formattedResult, resolveCommandFormat, type CliFormat } from '../lib/cli-output.js';

const LIST_SCHEMA = 'narada.host_fleet.list.v1' as const;
const SHOW_SCHEMA = 'narada.host_fleet.show.v1' as const;
const REGISTER_SCHEMA = 'narada.host_fleet.register.v1' as const;
const LIFECYCLE_SCHEMA = 'narada.host_fleet.lifecycle.v1' as const;
const AUDIT_SCHEMA = 'narada.host_fleet.audit_list.v1' as const;
const PROBE_SCHEMA = 'narada.host_fleet.probe.v1' as const;

function asFormat(value: unknown): CliFormat {
  return resolveCommandFormat(value, 'auto');
}

function exactHostKey(hostId: string, hostInstanceId: string): HostKey {
  return { host_id: hostId, host_instance_id: hostInstanceId };
}

function serializeHost(host: HostRecord | null): Record<string, unknown> | null {
  if (!host) return null;
  return {
    ...host,
    gateway: { ...host.gateway, admitted_paths: [...host.gateway.admitted_paths] },
    capabilities: [...host.capabilities],
    admitted_sites: [...host.admitted_sites],
  };
}

function humanHost(host: HostRecord): string {
  return `${host.host_id}@${host.host_instance_id}  ${host.display_name}  ${host.platform}  ${host.lifecycle_state}  ${host.health.status}`;
}

function withHuman<T extends Record<string, unknown>>(result: T, format: CliFormat, lines: string[]): T | (T & { _formatted: string }) {
  return formattedResult(result, lines, format);
}

function registryOperationResult(
  schema: string,
  registryPath: string,
  operation: HostFleetRegistryResult,
  format: CliFormat,
): { exitCode: number; result: unknown } {
  const refused = operation.status === 'refused';
  const result = {
    schema,
    status: refused ? 'refused' : operation.status,
    mutation_performed: operation.mutation_performed,
    registry_path: registryPath,
    host: serializeHost(operation.host),
    reason: operation.reason,
  };
  return {
    exitCode: refused ? 1 : 0,
    result: withHuman(result, format, [
      refused
        ? `Fleet operation refused: ${operation.reason ?? 'unknown_reason'}`
        : `Fleet operation ${operation.status}: ${operation.host ? humanHost(operation.host) : 'host unavailable'}`,
      `Registry: ${registryPath}`,
    ]),
  };
}

export interface FleetListCommandOptions {
  includeRetired?: boolean;
  format?: unknown;
}

export async function fleetListCommand(options: FleetListCommandOptions): Promise<{ exitCode: number; result: unknown }> {
  const registryPath = resolveHostFleetRegistryDbPath();
  const registry = openHostFleetRegistry(registryPath);
  try {
    const hosts = registry.listHosts({ includeRetired: options.includeRetired === true });
    const format = asFormat(options.format);
    const result = {
      schema: LIST_SCHEMA,
      status: 'ok',
      registry_path: registryPath,
      count: hosts.length,
      overview: projectHostFleetOverview(hosts),
      hosts: hosts.map(serializeHost),
    };
    return {
      exitCode: 0,
      result: withHuman(result, format, hosts.length > 0
        ? [`Hosts (${hosts.length})`, ...hosts.map(humanHost), `Registry: ${registryPath}`]
        : ['No registered hosts', `Registry: ${registryPath}`]),
    };
  } finally {
    registry.close();
  }
}

export interface FleetShowCommandOptions {
  hostId: string;
  hostInstanceId: string;
  format?: unknown;
}

export async function fleetShowCommand(options: FleetShowCommandOptions): Promise<{ exitCode: number; result: unknown }> {
  const registryPath = resolveHostFleetRegistryDbPath();
  const registry = openHostFleetRegistry(registryPath);
  try {
    const key = exactHostKey(options.hostId, options.hostInstanceId);
    const host = registry.getHost(key);
    const format = asFormat(options.format);
    if (!host) {
      const result = { ...refusal({ reason: 'host_not_registered', host: key }), schema: SHOW_SCHEMA, registry_path: registryPath };
      return {
        exitCode: 1,
        result: withHuman(result, format, [`Host not registered: ${options.hostId}@${options.hostInstanceId}`, `Registry: ${registryPath}`]),
      };
    }
    const result = {
      schema: SHOW_SCHEMA,
      status: 'ok',
      registry_path: registryPath,
      host: serializeHost(host),
      audit: registry.listAudit({ host: key, limit: 20 }),
    };
    return {
      exitCode: 0,
      result: withHuman(result, format, [humanHost(host), `Gateway: ${host.gateway.endpoint}`, `Registry: ${registryPath}`]),
    };
  } finally {
    registry.close();
  }
}

export interface FleetRegisterCommandOptions {
  hostId: string;
  hostInstanceId: string;
  displayName: string;
  platform: HostPlatform;
  naradaVersion?: string;
  endpoint: string;
  transport: HostGatewayTransport;
  credentialRef: string;
  admittedPath: string[];
  capability?: string[];
  site?: string[];
  allowReenrollment?: boolean;
  format?: unknown;
}

export async function fleetRegisterCommand(options: FleetRegisterCommandOptions): Promise<{ exitCode: number; result: unknown }> {
  const registryPath = resolveHostFleetRegistryDbPath();
  const registry = openHostFleetRegistry(registryPath);
  try {
    const input: HostRecordInput = {
      host_id: options.hostId,
      host_instance_id: options.hostInstanceId,
      display_name: options.displayName,
      platform: options.platform,
      narada_version: options.naradaVersion,
      gateway: {
        endpoint: options.endpoint,
        transport: options.transport,
        admitted_paths: options.admittedPath,
      },
      credential_ref: options.credentialRef,
      capabilities: options.capability,
      admitted_sites: options.site,
    };
    return registryOperationResult(
      REGISTER_SCHEMA,
      registryPath,
      registry.registerHost(input, { allow_reenrollment: options.allowReenrollment === true }),
      asFormat(options.format),
    );
  } finally {
    registry.close();
  }
}

export interface FleetLifecycleCommandOptions {
  hostId: string;
  hostInstanceId: string;
  reason?: string;
  format?: unknown;
}

export async function fleetRevokeCommand(options: FleetLifecycleCommandOptions): Promise<{ exitCode: number; result: unknown }> {
  return fleetLifecycleCommand('revoke', options);
}

export async function fleetRetireCommand(options: FleetLifecycleCommandOptions): Promise<{ exitCode: number; result: unknown }> {
  return fleetLifecycleCommand('retire', options);
}

async function fleetLifecycleCommand(operation: 'revoke' | 'retire', options: FleetLifecycleCommandOptions): Promise<{ exitCode: number; result: unknown }> {
  const registryPath = resolveHostFleetRegistryDbPath();
  const registry = openHostFleetRegistry(registryPath);
  try {
    const key = exactHostKey(options.hostId, options.hostInstanceId);
    const result = operation === 'revoke'
      ? registry.revokeHost(key, options.reason)
      : registry.retireHost(key, options.reason);
    return registryOperationResult(LIFECYCLE_SCHEMA, registryPath, result, asFormat(options.format));
  } finally {
    registry.close();
  }
}

export interface FleetAuditCommandOptions {
  hostId?: string;
  hostInstanceId?: string;
  limit?: number;
  format?: unknown;
}

export async function fleetAuditCommand(options: FleetAuditCommandOptions): Promise<{ exitCode: number; result: unknown }> {
  const registryPath = resolveHostFleetRegistryDbPath();
  const registry = openHostFleetRegistry(registryPath);
  try {
    const hasHostId = options.hostId !== undefined;
    const hasHostInstanceId = options.hostInstanceId !== undefined;
    const format = asFormat(options.format);
    if (hasHostId !== hasHostInstanceId) {
      const result = {
        ...refusal({ reason: 'host_audit_filter_requires_host_id_and_instance' }),
        schema: AUDIT_SCHEMA,
        registry_path: registryPath,
      };
      return {
        exitCode: 1,
        result: withHuman(result, format, [
          'Fleet audit refused: --host-id and --instance must be supplied together',
          `Registry: ${registryPath}`,
        ]),
      };
    }
    const host = options.hostId && options.hostInstanceId
      ? exactHostKey(options.hostId, options.hostInstanceId)
      : undefined;
    const entries = registry.listAudit({ host, limit: options.limit });
    const result = { schema: AUDIT_SCHEMA, status: 'ok', registry_path: registryPath, count: entries.length, entries };
    return {
      exitCode: 0,
      result: withHuman(result, format, [
        `Audit entries (${entries.length})`,
        ...entries.map((entry) => `${entry.recorded_at}  ${entry.operation}  ${entry.status}  ${entry.host.host_id}@${entry.host.host_instance_id}${entry.reason ? `  ${entry.reason}` : ''}`),
        `Registry: ${registryPath}`,
      ]),
    };
  } finally {
    registry.close();
  }
}

export interface FleetProbeCommandOptions {
  hostId: string;
  hostInstanceId: string;
  timeoutMs?: number;
  format?: unknown;
}

function resolveCredentialRef(reference: string): string | null {
  if (!reference.startsWith('env://')) throw new Error('host_gateway_credential_ref_requires_env_resolver');
  const name = reference.slice('env://'.length);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('host_gateway_credential_env_name_invalid');
  return process.env[name] ?? null;
}

export async function fleetProbeCommand(options: FleetProbeCommandOptions): Promise<{ exitCode: number; result: unknown }> {
  const registryPath = resolveHostFleetRegistryDbPath();
  const registry = openHostFleetRegistry(registryPath);
  try {
    const key = exactHostKey(options.hostId, options.hostInstanceId);
    const host = registry.getHost(key);
    const format = asFormat(options.format);
    if (!host) {
      const result = { ...refusal({ reason: 'host_not_registered', host: key }), schema: PROBE_SCHEMA, registry_path: registryPath };
      return { exitCode: 1, result: withHuman(result, format, [`Host not registered: ${options.hostId}@${options.hostInstanceId}`]) };
    }
    const gateway = createHostGatewayClient(host, { timeout_ms: options.timeoutMs, credential_resolver: resolveCredentialRef });
    const health = await gateway.health();
    const update = registry.updateHealth(key, health);
    const result = {
      schema: PROBE_SCHEMA,
      status: health.status,
      registry_path: registryPath,
      host: serializeHost(update.host ?? host),
      health,
      registry_update: update,
    };
    return {
      exitCode: health.status === 'online' || health.status === 'degraded' ? 0 : 1,
      result: withHuman(result, format, [
        `${options.hostId}@${options.hostInstanceId}: ${health.status}`,
        ...(health.detail ? [`Detail: ${health.detail}`] : []),
        `Gateway: ${host.gateway.endpoint}`,
      ]),
    };
  } finally {
    registry.close();
  }
}

export function registerFleetCommands(program: Command): void {
  const fleet = program.command('fleet').description('Host Fleet Registry and exact host-boundary operators');

  fleet.command('list')
    .description('List enrolled hosts from the canonical User Site Host Registry')
    .option('--include-retired', 'Include retired host instances')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'fleet list', emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => asFormat(opts.format),
      invocation: (opts) => fleetListCommand({ includeRetired: opts.includeRetired === true, format: asFormat(opts.format) }),
    }));

  fleet.command('show <host-id>')
    .description('Show one exact host instance and its audit trail')
    .requiredOption('--instance <host-instance-id>', 'Exact host instance ID')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'fleet show', emit: emitCommandResult,
      format: (_hostId: string, opts: CommanderOptionValues) => asFormat(opts.format),
      invocation: (hostId, opts) => fleetShowCommand({ hostId, hostInstanceId: opts.instance as string, format: asFormat(opts.format) }),
    }));

  fleet.command('register')
    .description('Enroll one host instance using a secret reference and explicit gateway routes')
    .requiredOption('--host-id <host-id>', 'Durable logical host ID')
    .requiredOption('--host-instance-id <host-instance-id>', 'Installation or runtime incarnation ID')
    .requiredOption('--display-name <name>', 'Operator-facing host name')
    .requiredOption('--platform <platform>', 'windows, linux, macos, cloudflare, or unknown')
    .option('--narada-version <version>', 'Narada version observed on the host')
    .requiredOption('--endpoint <url>', 'Declared Host Gateway endpoint')
    .requiredOption('--transport <transport>', 'loopback, ssh-tunnel, https, or cloudflare')
    .requiredOption('--credential-ref <ref>', 'Secret reference, for example env://NARADA_ZIMA_GATEWAY_TOKEN')
    .requiredOption('--admitted-path <path...>', 'Explicit Host Gateway paths, for example /health /console/routes')
    .option('--capability <name...>', 'Declared host capability')
    .option('--site <site-id...>', 'Site admitted on this host')
    .option('--allow-reenrollment', 'Explicitly retire an active sibling instance with the same host ID')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'fleet register', emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => asFormat(opts.format),
      invocation: (opts) => fleetRegisterCommand({
        hostId: opts.hostId as string,
        hostInstanceId: opts.hostInstanceId as string,
        displayName: opts.displayName as string,
        platform: opts.platform as HostPlatform,
        naradaVersion: opts.naradaVersion as string | undefined,
        endpoint: opts.endpoint as string,
        transport: opts.transport as HostGatewayTransport,
        credentialRef: opts.credentialRef as string,
        admittedPath: opts.admittedPath as string[],
        capability: opts.capability as string[] | undefined,
        site: opts.site as string[] | undefined,
        allowReenrollment: opts.allowReenrollment === true,
        format: asFormat(opts.format),
      }),
    }));

  for (const operation of ['revoke', 'retire'] as const) {
    fleet.command(`${operation} <host-id>`)
      .description(`${operation === 'revoke' ? 'Revoke' : 'Retire'} one exact host instance`)
      .requiredOption('--instance <host-instance-id>', 'Exact host instance ID')
      .option('--reason <reason>', 'Audited reason')
      .option('--format <format>', 'Output format: json, human, or auto', 'auto')
      .action(directCommandAction<[string, CommanderOptionValues]>({
        command: `fleet ${operation}`, emit: emitCommandResult,
        format: (_hostId: string, opts: CommanderOptionValues) => asFormat(opts.format),
        invocation: (hostId, opts) => (operation === 'revoke' ? fleetRevokeCommand : fleetRetireCommand)({
          hostId, hostInstanceId: opts.instance as string, reason: opts.reason as string | undefined, format: asFormat(opts.format),
        }),
      }));
  }

  fleet.command('audit')
    .description('List host enrollment and lifecycle audit entries')
    .option('--host-id <host-id>', 'Filter by exact host ID; requires --instance')
    .option('--instance <host-instance-id>', 'Filter by exact host instance ID')
    .option('--limit <n>', 'Maximum entries', '100')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'fleet audit', emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => asFormat(opts.format),
      invocation: (opts) => fleetAuditCommand({
        hostId: opts.hostId as string | undefined,
        hostInstanceId: opts.instance as string | undefined,
        limit: Number(opts.limit),
        format: asFormat(opts.format),
      }),
    }));

  fleet.command('probe <host-id>')
    .description('Probe one exact Host Gateway and update its cached health projection')
    .requiredOption('--instance <host-instance-id>', 'Exact host instance ID')
    .option('--timeout-ms <ms>', 'Gateway timeout in milliseconds', '5000')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'fleet probe', emit: emitCommandResult,
      format: (_hostId: string, opts: CommanderOptionValues) => asFormat(opts.format),
      invocation: (hostId, opts) => fleetProbeCommand({
        hostId, hostInstanceId: opts.instance as string, timeoutMs: Number(opts.timeoutMs), format: asFormat(opts.format),
      }),
    }));
}
