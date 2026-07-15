import type { Command } from 'commander';
import {
  operatorSurfaceKindsForProjectionCapability,
} from '@narada2/operator-surface-runtime-contract/operator-surface-runtime-selection';
import {directCommandAction, silentCommandContext, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { narsAttachCommandCommand, narsAuthorityTransitionExecuteCommand, narsAuthorityTransitionPlanCommand, narsSessionsCommand } from './nars.js';
import { narsProjectionBridgeRunCommand, narsProjectionBridgeStartCommand, narsProjectionRegisterCommand } from './nars-projection.js';

const NARS_PROJECTION_SURFACE_KINDS = operatorSurfaceKindsForProjectionCapability('nars_attach');

export function registerNarsCommands(program: Command): void {
  const nars = program
    .command('nars')
    .description('NARS session discovery and attachment helpers');

  nars
    .command('sessions')
    .description('Discover Site-local Narada Agent Runtime Server sessions')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <id>', 'Registered Site id')
    .option('--no-health', 'Skip bounded HTTP /health probes')
    .option('--health-timeout-ms <ms>', 'Per-session health probe timeout', '500')
    .option('--limit <n>', 'Maximum sessions to print', '20')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'nars sessions',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => narsSessionsCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        health: opts.health as boolean | undefined,
        healthTimeoutMs: opts.healthTimeoutMs ? Number(opts.healthTimeoutMs) : undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  const projection = nars
    .command('projection')
    .description('Manage NARS projection attachments');

  const authorityTransition = nars
    .command('authority-transition')
    .description('Plan governed NARS authority runtime host transitions');

  authorityTransition
    .command('plan')
    .description('Read-only plan for moving NARS authority from the current host to a target host')
    .requiredOption('--session <id>', 'Concrete NARS session id')
    .requiredOption('--target-host <host-kind>', 'Target authority host kind: local|cloudflare-host')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <id>', 'Registered Site id')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'nars authority-transition plan',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => narsAuthorityTransitionPlanCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        session: opts.session as string | undefined,
        targetHost: opts.targetHost as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  projection
    .command('register')
    .description('Plan or register a Cloudflare-hosted projection for one NARS session')
    .requiredOption('--site-id <id>', 'Narada Site id for the projected local NARS session')
    .requiredOption('--session <id>', 'Concrete NARS session id')
    .option('--site-root <path>', 'Local Site root')
    .option('--projection-id <id>', 'Stable projection id')
    .option('--carrier-session-id <id>', 'Explicit Cloudflare carrier session id linked to this projection')
    .option('--operation-id <id>', 'Explicit Cloudflare operation id linked to this projection')
    .option('--event-policy <policy>', 'Event policy: conversation|operator|diagnostic|raw', 'operator')
    .option('--input-verb <method...>', 'Allowed Cloudflare adapter input verb(s); repeat or comma-separate values', ['conversation.send', 'conversation.enqueue', 'conversation.steer', 'conversation.interrupt', 'session.close'])
    .option('--cache-policy <policy>', 'Cache policy: short_bounded|durable_archive', 'short_bounded')
    .option('--artifact-content <mode>', 'Artifact content policy: metadata_only|selected_kinds|explicit_artifacts|none', 'metadata_only')
    .option('--artifact-kind <kind...>', 'Allowed artifact kind(s); repeat or comma-separate values', ['markdown', 'json', 'text'])
    .option('--cloudflare-api-base-url <url>', 'Cloudflare projection API base URL; with --no-dry-run this registers remote access immediately')
    .option('--cloudflare-carrier-url <url>', 'Cloudflare carrier Worker URL used for optional cookie-backed site.read preflight')
    .option('--operator-cookie-file <path>', 'Captured narada_operator_session cookie file for optional/required operator session preflight')
    .option('--site-coherence-site-id <id>', 'Cloudflare Site id to read during operator-session preflight', 'site_narada_cloudflare')
    .option('--require-operator-session', 'Refuse live registration unless cookie-backed Cloudflare site.read preflight succeeds')
    .option('--preflight-only', 'Run live projection registration preflight without writing local or remote registration')
    .option('--created-by <principal>', 'Principal creating the projection intent', 'operator')
    .option('--dry-run', 'Build the registration plan without remote mutation', true)
    .option('--no-dry-run', 'Record a local pending-registration plan for a later Cloudflare write')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'nars projection register',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => narsProjectionRegisterCommand({
        siteId: opts.siteId as string | undefined,
        siteRoot: opts.siteRoot as string | undefined,
        session: opts.session as string | undefined,
        projectionId: opts.projectionId as string | undefined,
        carrierSessionId: opts.carrierSessionId as string | undefined,
        operationId: opts.operationId as string | undefined,
        eventPolicy: opts.eventPolicy as string | undefined,
        inputVerb: opts.inputVerb as string[] | undefined,
        cachePolicy: opts.cachePolicy as string | undefined,
        artifactContent: opts.artifactContent as string | undefined,
        artifactKind: opts.artifactKind as string[] | undefined,
        cloudflareApiBaseUrl: opts.cloudflareApiBaseUrl as string | undefined,
        cloudflareCarrierUrl: opts.cloudflareCarrierUrl as string | undefined,
        operatorCookieFile: opts.operatorCookieFile as string | undefined,
        siteCoherenceSiteId: opts.siteCoherenceSiteId as string | undefined,
        requireOperatorSession: opts.requireOperatorSession as boolean | undefined,
        preflightOnly: opts.preflightOnly as boolean | undefined,
        createdBy: opts.createdBy as string | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  authorityTransition
    .command('execute')
    .description('Prepare the next governed NARS authority transition slice after a feasible plan')
    .requiredOption('--session <id>', 'Concrete NARS session id')
    .requiredOption('--target-host <host-kind>', 'Target authority host kind: local|cloudflare-host')
    .option('--step <step>', 'Execute step: prepare-target', 'prepare-target')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <id>', 'Registered Site id')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'nars authority-transition execute',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => narsAuthorityTransitionExecuteCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        session: opts.session as string | undefined,
        targetHost: opts.targetHost as string | undefined,
        step: opts.step as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  projection
    .command('bridge-start')
    .description('Start one local Cloudflare NARS projection bridge pass for a registered projection')
    .requiredOption('--site-root <path>', 'Local Site root')
    .requiredOption('--projection-id <id>', 'Projection id')
    .option('--cloudflare-api-base-url <url>', 'Cloudflare projection API base URL for remote publish')
    .option('--max-events <n>', 'Maximum events to backfill in this pass', '200')
    .option('--max-artifacts <n>', 'Maximum artifacts to backfill in this pass', '50')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'nars projection bridge-start',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => narsProjectionBridgeStartCommand({
        siteRoot: opts.siteRoot as string | undefined,
        projectionId: opts.projectionId as string | undefined,
        cloudflareApiBaseUrl: opts.cloudflareApiBaseUrl as string | undefined,
        maxEvents: opts.maxEvents ? Number(opts.maxEvents) : undefined,
        maxArtifacts: opts.maxArtifacts ? Number(opts.maxArtifacts) : undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  projection
    .command('bridge-run')
    .description('Run the local Cloudflare NARS projection bridge as a durable polling process')
    .requiredOption('--site-root <path>', 'Local Site root')
    .requiredOption('--projection-id <id>', 'Projection id')
    .option('--cloudflare-api-base-url <url>', 'Cloudflare projection API base URL for remote publish')
    .option('--max-events <n>', 'Maximum events to backfill in each pass', '200')
    .option('--max-artifacts <n>', 'Maximum artifacts to backfill in each pass', '50')
    .option('--poll-interval-ms <n>', 'Polling interval in milliseconds', '5000')
    .option('--stop-after-iterations <n>', 'Testing/diagnostic stop condition')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'nars projection bridge-run',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => narsProjectionBridgeRunCommand({
        siteRoot: opts.siteRoot as string | undefined,
        projectionId: opts.projectionId as string | undefined,
        cloudflareApiBaseUrl: opts.cloudflareApiBaseUrl as string | undefined,
        maxEvents: opts.maxEvents ? Number(opts.maxEvents) : undefined,
        maxArtifacts: opts.maxArtifacts ? Number(opts.maxArtifacts) : undefined,
        pollIntervalMs: opts.pollIntervalMs ? Number(opts.pollIntervalMs) : undefined,
        stopAfterIterations: opts.stopAfterIterations ? Number(opts.stopAfterIterations) : undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  nars
    .command('attach-command')
    .description('Resolve the command for attaching a projection to one NARS session')
    .requiredOption('--session <id>', 'NARS session id')
    .option('--surface <surface>', `Projection surface: ${NARS_PROJECTION_SURFACE_KINDS.join('|')}`, 'agent-web-ui')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <id>', 'Registered Site id')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'nars attach-command',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => narsAttachCommandCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        session: opts.session as string | undefined,
        surface: opts.surface as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
