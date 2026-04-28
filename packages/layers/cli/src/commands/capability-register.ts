import type { Command } from 'commander';
import {
  capabilityExplainCommand,
  capabilityGrantCommand,
  capabilityListCommand,
  capabilityRevokeCommand,
} from './capability.js';
import { directCommandAction, silentCommandContext } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerCapabilityCommands(program: Command): void {
  const capabilityCmd = program
    .command('capability')
    .description('Capability and consent registry operators');

  capabilityCmd
    .command('grant')
    .description('Grant a bounded capability without storing raw secrets')
    .requiredOption('--site <id>', 'Site receiving or exercising the capability')
    .requiredOption('--principal <id>', 'Principal covered by the grant')
    .option('--agent <id>', 'Agent covered by the grant')
    .requiredOption('--kind <kind>', 'Capability kind, e.g. filesystem.write, site.delivery, github.repo')
    .option('--scope <json>', 'JSON scope object', '{}')
    .requiredOption('--allow <csv>', 'Comma-separated allowed actions')
    .option('--deny <csv>', 'Comma-separated denied actions')
    .option('--credential-ref <ref>', 'Secret reference only: env:, keychain:, credential-manager:, secret-service:, pass:, vault:, config-ref:, or none')
    .option('--evidence-ref <ref>', 'Evidence of grant or consent')
    .option('--expires-at <iso>', 'Expiry timestamp')
    .requiredOption('--by <id>', 'Principal granting the capability')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'capability grant',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => capabilityGrantCommand({
        site: opts.site as string | undefined,
        principal: opts.principal as string | undefined,
        agent: opts.agent as string | undefined,
        kind: opts.kind as string | undefined,
        scope: opts.scope as string | undefined,
        allow: opts.allow as string | undefined,
        deny: opts.deny as string | undefined,
        credentialRef: opts.credentialRef as string | undefined,
        evidenceRef: opts.evidenceRef as string | undefined,
        expiresAt: opts.expiresAt as string | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  capabilityCmd
    .command('list')
    .description('List bounded capability grants')
    .option('--site <id>', 'Filter by Site')
    .option('--principal <id>', 'Filter by principal')
    .option('--agent <id>', 'Filter by agent')
    .option('--kind <kind>', 'Filter by capability kind')
    .option('--status <status>', 'Filter by effective status: active, revoked, expired')
    .option('--limit <n>', 'Maximum grants', '20')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'capability list',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => capabilityListCommand({
        site: opts.site as string | undefined,
        principal: opts.principal as string | undefined,
        agent: opts.agent as string | undefined,
        kind: opts.kind as string | undefined,
        status: opts.status as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  capabilityCmd
    .command('explain <grant-id>')
    .description('Explain whether a capability grant is currently admissible')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'capability explain',
      emit: emitCommandResult,
      format: (_grantId: string, opts: Record<string, unknown>) => opts.format,
      invocation: (grantId, opts) => capabilityExplainCommand({
        grantId,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  capabilityCmd
    .command('revoke <grant-id>')
    .description('Revoke a capability grant')
    .requiredOption('--by <id>', 'Principal revoking the grant')
    .option('--reason <text>', 'Revocation reason')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'capability revoke',
      emit: emitCommandResult,
      format: (_grantId: string, opts: Record<string, unknown>) => opts.format,
      invocation: (grantId, opts) => capabilityRevokeCommand({
        grantId,
        by: opts.by as string | undefined,
        reason: opts.reason as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
