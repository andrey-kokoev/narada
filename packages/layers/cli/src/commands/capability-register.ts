import type { Command } from 'commander';
import {
  capabilityAnnouncementCreateCommand,
  capabilityAnnouncementListCommand,
  capabilityAnnouncementPublishCommand,
  capabilityAnnouncementShowCommand,
  capabilityAnnouncementSupersedeCommand,
  capabilityBindCredentialCommand,
  capabilityCredentialPreflightCommand,
  capabilityExplainCommand,
  capabilityGrantCommand,
  capabilityListCommand,
  capabilityRequestCommand,
  capabilityRevokeCommand,
} from './capability.js';
import {directCommandAction, silentCommandContext, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerCapabilityCommands(program: Command): void {
  const capabilityCmd = program
    .command('capability')
    .description('Capability and consent registry operators');

  capabilityCmd
    .command('announce')
    .description('Create a typed capability announcement for discovery, not execution consent')
    .requiredOption('--id <id>', 'Capability announcement id')
    .requiredOption('--summary <text>', 'Human-readable capability summary')
    .requiredOption('--owner-site <id>', 'Site that owns the capability')
    .requiredOption('--authority-scope <text>', 'Authority scope where the capability is valid')
    .option('--usable-by <csv>', 'Roles or identities that may use or inspect this capability')
    .option('--entrypoint <csv>', 'Command/script/UI entrypoints')
    .option('--prerequisite <csv>', 'Prerequisites before use')
    .option('--evidence <csv>', 'Evidence references proving the capability exists')
    .option('--constraint <csv>', 'Constraints and safety limits')
    .option('--safety-posture <text>', 'Safety posture label', 'metadata_only')
    .option('--adoption-posture <text>', 'Adoption posture label', 'operator_entrypoint')
    .option('--supersedes <id>', 'Prior announcement superseded by this one')
    .requiredOption('--by <id>', 'Principal announcing the capability')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'capability announce',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => capabilityAnnouncementCreateCommand({
        id: opts.id as string | undefined,
        summary: opts.summary as string | undefined,
        ownerSite: opts.ownerSite as string | undefined,
        authorityScope: opts.authorityScope as string | undefined,
        usableBy: opts.usableBy as string | undefined,
        entrypoint: opts.entrypoint as string | undefined,
        prerequisite: opts.prerequisite as string | undefined,
        evidence: opts.evidence as string | undefined,
        constraint: opts.constraint as string | undefined,
        safetyPosture: opts.safetyPosture as string | undefined,
        adoptionPosture: opts.adoptionPosture as string | undefined,
        supersedes: opts.supersedes as string | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  capabilityCmd
    .command('announcements')
    .description('List typed capability announcements')
    .option('--owner-site <id>', 'Filter by owner Site')
    .option('--status <status>', 'Filter by status: active, superseded, withdrawn')
    .option('--limit <n>', 'Maximum announcements', '20')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'capability announcements',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => capabilityAnnouncementListCommand({
        ownerSite: opts.ownerSite as string | undefined,
        status: opts.status as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  const announcementCmd = capabilityCmd
    .command('announcement')
    .description('Inspect, publish, or supersede one capability announcement');

  announcementCmd
    .command('show <id>')
    .description('Show one typed capability announcement')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'capability announcement show',
      emit: emitCommandResult,
      format: (_id: string, opts: CommanderOptionValues) => opts.format,
      invocation: (id, opts) => capabilityAnnouncementShowCommand({
        id,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  announcementCmd
    .command('publish <id>')
    .description('Publish a capability announcement as an inert Canonical Inbox observation')
    .requiredOption('--by <id>', 'Principal publishing the announcement')
    .option('--target-locus <locus>', 'Target locus routing hint')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'capability announcement publish',
      emit: emitCommandResult,
      format: (_id: string, opts: CommanderOptionValues) => opts.format,
      invocation: (id, opts) => capabilityAnnouncementPublishCommand({
        id,
        by: opts.by as string | undefined,
        targetLocus: opts.targetLocus as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  announcementCmd
    .command('supersede <id>')
    .description('Mark one capability announcement superseded by another')
    .requiredOption('--replacement <id>', 'Replacement announcement id')
    .requiredOption('--by <id>', 'Principal recording supersession')
    .option('--reason <text>', 'Supersession reason')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'capability announcement supersede',
      emit: emitCommandResult,
      format: (_id: string, opts: CommanderOptionValues) => opts.format,
      invocation: (id, opts) => capabilityAnnouncementSupersedeCommand({
        id,
        replacementId: opts.replacement as string | undefined,
        by: opts.by as string | undefined,
        reason: opts.reason as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  capabilityCmd
    .command('credential-preflight')
    .description('Classify credential binding, local env repair, and remote secret mutation before any secret effect')
    .requiredOption('--site <id>', 'Site receiving or exercising the capability')
    .requiredOption('--principal <id>', 'Principal covered by the credential operation')
    .requiredOption('--kind <kind>', 'Capability kind, e.g. voice.transcription.remote')
    .requiredOption('--operation <kind>', 'Credential operation: bind_existing_secret, create_new_secret, rotate_remote_secret, set_local_runtime_env')
    .option('--credential-ref <ref>', 'Secret reference only: env:, keychain:, credential-manager:, secret-service:, pass:, vault:, config-ref:, or none')
    .option('--local-env <name>', 'Local env var to check without printing its value')
    .option('--remote-secret-name <name>', 'Remote secret name for explicitly approved create/rotate operations')
    .option('--remote-worker <name>', 'Remote worker/service affected by explicitly approved create/rotate operations')
    .option('--approve-remote-secret-mutation', 'Explicitly approve dangerous remote secret creation or rotation', false)
    .option('--by <id>', 'Principal recording the preflight')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'capability credential-preflight',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => capabilityCredentialPreflightCommand({
        site: opts.site as string | undefined,
        principal: opts.principal as string | undefined,
        kind: opts.kind as string | undefined,
        operation: opts.operation as never,
        credentialRef: opts.credentialRef as string | undefined,
        localEnv: opts.localEnv as string | undefined,
        remoteSecretName: opts.remoteSecretName as string | undefined,
        remoteWorker: opts.remoteWorker as string | undefined,
        approveRemoteSecretMutation: opts.approveRemoteSecretMutation as boolean | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  capabilityCmd
    .command('request')
    .description('Classify a capability request without executing it')
    .requiredOption('--site <id>', 'Site receiving or exercising the capability')
    .requiredOption('--principal <id>', 'Principal requesting the capability')
    .option('--agent <id>', 'Agent identity requesting the capability')
    .requiredOption('--kind <kind>', 'Capability kind, e.g. browser_dom_inspection')
    .option('--origin <origin>', 'Requested browser origin or comparable authority origin')
    .option('--path <path>', 'Requested path or comparable bounded resource path')
    .requiredOption('--interaction <mode>', 'Requested interaction mode')
    .option('--evidence-sink <sink>', 'Requested evidence sink')
    .option('--redaction <csv>', 'Additional redaction categories')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'capability request',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => capabilityRequestCommand({
        site: opts.site as string | undefined,
        principal: opts.principal as string | undefined,
        agent: opts.agent as string | undefined,
        kind: opts.kind as string | undefined,
        origin: opts.origin as string | undefined,
        path: opts.path as string | undefined,
        interaction: opts.interaction as string | undefined,
        evidenceSink: opts.evidenceSink as string | undefined,
        redaction: opts.redaction as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  capabilityCmd
    .command('bind-credential')
    .description('Bind or reuse a credential reference for Site onboarding without storing raw secrets')
    .requiredOption('--site <id>', 'Site receiving or exercising the capability')
    .requiredOption('--principal <id>', 'Principal covered by the binding')
    .option('--agent <id>', 'Agent covered by the binding')
    .requiredOption('--kind <kind>', 'Capability kind, e.g. graph.client_credentials')
    .option('--scope <json>', 'JSON scope object', '{}')
    .requiredOption('--allow <csv>', 'Comma-separated allowed actions')
    .option('--deny <csv>', 'Comma-separated denied actions')
    .requiredOption('--credential-ref <ref>', 'Secret reference only: env:, keychain:, credential-manager:, secret-service:, pass:, vault:, config-ref:, or none')
    .option('--local-env <name>', 'Local env var to check for runtime material availability without printing its value')
    .option('--reused-from-site <id>', 'Prior Site whose credential posture is being reused')
    .option('--evidence-ref <ref>', 'Evidence of grant or consent')
    .option('--rationale <text>', 'Why this credential reference is being reused')
    .option('--expires-at <iso>', 'Expiry timestamp')
    .requiredOption('--by <id>', 'Principal recording the binding')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'capability bind-credential',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => capabilityBindCredentialCommand({
        site: opts.site as string | undefined,
        principal: opts.principal as string | undefined,
        agent: opts.agent as string | undefined,
        kind: opts.kind as string | undefined,
        scope: opts.scope as string | undefined,
        allow: opts.allow as string | undefined,
        deny: opts.deny as string | undefined,
        credentialRef: opts.credentialRef as string | undefined,
        localEnv: opts.localEnv as string | undefined,
        reusedFromSite: opts.reusedFromSite as string | undefined,
        evidenceRef: opts.evidenceRef as string | undefined,
        rationale: opts.rationale as string | undefined,
        expiresAt: opts.expiresAt as string | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

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
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'capability grant',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
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
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'capability list',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
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
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'capability explain',
      emit: emitCommandResult,
      format: (_grantId: string, opts: CommanderOptionValues) => opts.format,
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
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'capability revoke',
      emit: emitCommandResult,
      format: (_grantId: string, opts: CommanderOptionValues) => opts.format,
      invocation: (grantId, opts) => capabilityRevokeCommand({
        grantId,
        by: opts.by as string | undefined,
        reason: opts.reason as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
