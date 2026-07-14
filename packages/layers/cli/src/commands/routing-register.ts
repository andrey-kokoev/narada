import type { Command } from 'commander';
import {
  routingAddCommand,
  routingExplainCommand,
  routingListCommand,
  routingResolveCommand,
} from './routing.js';
import {directCommandAction, silentCommandContext, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerRoutingCommands(program: Command): void {
  const routingCmd = program
    .command('routing')
    .description('Canonical routing and addressing operators');

  routingCmd
    .command('add')
    .description('Add a durable address route')
    .requiredOption('--target-kind <kind>', 'Target kind, e.g. site, principal, operation')
    .requiredOption('--target-ref <ref>', 'Target reference')
    .requiredOption('--authority-locus <locus>', 'Authority locus for the target')
    .requiredOption('--address-kind <kind>', 'Address kind, e.g. file_drop, github_repo, email, webhook')
    .requiredOption('--address-ref <ref>', 'Address reference; not a secret')
    .requiredOption('--transport <transport>', 'Transport kind')
    .option('--capability-kind <kind>', 'Capability kind required for execution')
    .option('--priority <n>', 'Lower values resolve first', '100')
    .option('--inactive', 'Create route as inactive', false)
    .option('--fallback-target <ref>', 'Fallback target reference')
    .option('--evidence-ref <ref>', 'Evidence for the route')
    .requiredOption('--by <id>', 'Principal creating the route')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'routing add',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => routingAddCommand({
        targetKind: opts.targetKind as string | undefined,
        targetRef: opts.targetRef as string | undefined,
        authorityLocus: opts.authorityLocus as string | undefined,
        addressKind: opts.addressKind as string | undefined,
        addressRef: opts.addressRef as string | undefined,
        transport: opts.transport as string | undefined,
        capabilityKind: opts.capabilityKind as string | undefined,
        priority: opts.priority ? Number(opts.priority) : undefined,
        inactive: opts.inactive as boolean | undefined,
        fallbackTarget: opts.fallbackTarget as string | undefined,
        evidenceRef: opts.evidenceRef as string | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  routingCmd
    .command('list')
    .description('List route address records')
    .option('--target-kind <kind>', 'Filter by target kind')
    .option('--target-ref <ref>', 'Filter by target ref')
    .option('--transport <transport>', 'Filter by transport')
    .option('--active <bool>', 'Filter by active true/false')
    .option('--limit <n>', 'Maximum routes', '20')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'routing list',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => routingListCommand({
        targetKind: opts.targetKind as string | undefined,
        targetRef: opts.targetRef as string | undefined,
        transport: opts.transport as string | undefined,
        active: opts.active as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  routingCmd
    .command('resolve')
    .description('Resolve a target to the selected route without mutation')
    .requiredOption('--target-kind <kind>', 'Target kind')
    .requiredOption('--target-ref <ref>', 'Target reference')
    .option('--transport <transport>', 'Transport filter')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'routing resolve',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => routingResolveCommand({
        targetKind: opts.targetKind as string | undefined,
        targetRef: opts.targetRef as string | undefined,
        transport: opts.transport as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  routingCmd
    .command('explain <route-id>')
    .description('Explain one route address record')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'routing explain',
      emit: emitCommandResult,
      format: (_routeId: string, opts: CommanderOptionValues) => opts.format,
      invocation: (routeId, opts) => routingExplainCommand({
        routeId,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
