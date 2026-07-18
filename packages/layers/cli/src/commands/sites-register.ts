import type { Command } from 'commander';
import {
  sitesListCommand,
  sitesDiscoverCommand,
  sitesShowCommand,
  sitesRemoveCommand,
  sitesDoctorCommand,
  sitesInitCommand,
  sitesCreateCommand,
  sitesSetupCommand,
  sitesCreatePresetsCommand,
  sitesLiveCarrierCommand,
  sitesBootstrapClientCommand,
  sitesBootstrapProjectCommand,
  sitesBootstrapWindowsCommand,
  sitesEnableCommand,
  sitesAgentBootstrapCommand,
  sitesTaskLifecycleInitCommand,
  sitesLifecycleExecuteAbsorbCommand,
  sitesLifecycleKindsCommand,
  sitesLifecyclePreflightCommand,
  sitesLineageEventsCommand,
  sitesRelationExplainCommand,
  sitesRelationListCommand,
  sitesRelationRecordCommand,
  sitesRelationValidateCommand,
  sitesReconcileAgentCliWrapperCommand,
  sitesReconcileToolSurfaceManifestCommand,
  sitesAuditToolSurfaceDuplicatesCommand,
  sitesDepsSyncCommand,
} from './sites.js';
import { siteImmuneScanCommand } from './site-immune-scan.js';
import { siteMutationAuthorityPreflightCommand } from './site-mutation-authority-preflight.js';
import {
  sitesRegistryAddCommand,
  sitesRegistryDiscoverCommand,
  sitesRegistryEditCommand,
  sitesRegistryListCommand,
  sitesRegistryShowCommand,
  sitesRegistryStateCommand,
} from './site-registry-management.js';
import { sitesLaunchCommand } from './sites-launch.js';
import {directCommandAction, silentCommandContext, wrapCommand, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, emitFiniteCommandResult, emitFormatterBackedCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerSitesCommands(program: Command): void {
  const sitesCmd = program
    .command('sites')
    .description('Discover and manage Narada Sites');

  const registryCmd = sitesCmd
    .command('registry')
    .description('Manage the User Site registry read model without mutating Site-owned state');

  registryCmd
    .command('list')
    .description('List canonical Site records, lifecycle, observation, provenance, and aliases')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'sites registry list',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => sitesRegistryListCommand({
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose })),
    }));

  registryCmd
    .command('show <site-id-or-alias>')
    .description('Show one Site record, management history, conflicts, and next actions')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'sites registry show',
      emit: emitCommandResult,
      format: (_reference: string, opts: CommanderOptionValues) => opts.format,
      invocation: (reference, opts) => sitesRegistryShowCommand({
        reference,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose })),
    }));

  registryCmd
    .command('discover')
    .description('Plan or apply bounded filesystem and launch-registry reconciliation')
    .option('--source <source>', 'Discovery source: filesystem, launch_registry, or all', 'all')
    .option('--root <path>', 'Restrict discovery to one Site root')
    .option('--actor <id>', 'Operator or agent identity')
    .option('--apply', 'Apply the planned registry changes', false)
    .option('--dry-run', 'Explicitly request planning without mutation', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'sites registry discover',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => sitesRegistryDiscoverCommand({
        source: opts.source as 'filesystem' | 'launch_registry' | 'all' | undefined,
        root: opts.root as string | undefined,
        actor: opts.actor as string | undefined,
        apply: opts.apply as boolean | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose })),
    }));

  registryCmd
    .command('add')
    .description('Plan or add one already-existing Site to the registry')
    .requiredOption('--site-id <id>', 'Canonical Site id')
    .requiredOption('--root <path>', 'Existing or expected Site root; files are never created')
    .option('--variant <variant>', 'Site variant: native, wsl, cloudflare, linux-user, or linux-system', 'native')
    .option('--substrate <substrate>', 'Declared substrate', 'windows')
    .option('--aim-json <json>', 'Bounded JSON aim summary')
    .option('--control-endpoint <endpoint>', 'Control endpoint reference')
    .option('--alias <alias...>', 'Legacy or launch alias; repeatable')
    .option('--source <source>', 'Source kind', 'manual')
    .option('--source-ref <ref>', 'Bounded source reference')
    .option('--reason <reason>', 'Reason when explicitly re-admitting a retired record')
    .option('--re-admit', 'Explicitly re-admit a retired registry record', false)
    .option('--actor <id>', 'Operator or agent identity')
    .option('--apply', 'Apply the planned registry change', false)
    .option('--dry-run', 'Explicitly request planning without mutation', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'sites registry add',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => sitesRegistryAddCommand({
        siteId: opts.siteId as string,
        root: opts.root as string,
        variant: opts.variant as string | undefined,
        substrate: opts.substrate as string | undefined,
        aimJson: opts.aimJson as string | undefined,
        controlEndpoint: opts.controlEndpoint as string | undefined,
        alias: opts.alias as string[] | undefined,
        source: opts.source as string | undefined,
        sourceRef: opts.sourceRef as string | undefined,
        reason: opts.reason as string | undefined,
        reAdmit: opts.reAdmit as boolean | undefined,
        actor: opts.actor as string | undefined,
        apply: opts.apply as boolean | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose })),
    }));

  registryCmd
    .command('edit <site-id-or-alias>')
    .description('Plan or patch one registry record without editing the Site')
    .option('--root <path>', 'Replace the registered Site root')
    .option('--variant <variant>', 'Replace the Site variant')
    .option('--substrate <substrate>', 'Replace the declared substrate')
    .option('--aim-json <json>', 'Replace the bounded JSON aim summary')
    .option('--control-endpoint <endpoint>', 'Replace the control endpoint reference')
    .option('--clear-aim-json', 'Clear the stored JSON aim summary', false)
    .option('--clear-control-endpoint', 'Clear the stored control endpoint', false)
    .option('--clear-aliases', 'Remove all stored aliases', false)
    .option('--alias <alias...>', 'Add a legacy or launch alias')
    .option('--source <source>', 'Append a source observation')
    .option('--source-ref <ref>', 'Bounded source reference')
    .requiredOption('--reason <reason>', 'Reason for the registry patch')
    .option('--actor <id>', 'Operator or agent identity')
    .option('--expected-revision <n>', 'Reject apply if the row revision changed')
    .option('--apply', 'Apply the planned registry change', false)
    .option('--dry-run', 'Explicitly request planning without mutation', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'sites registry edit',
      emit: emitCommandResult,
      format: (_reference: string, opts: CommanderOptionValues) => opts.format,
      invocation: (reference, opts) => sitesRegistryEditCommand({
        reference,
        root: opts.root as string | undefined,
        variant: opts.variant as string | undefined,
        substrate: opts.substrate as string | undefined,
        aimJson: opts.aimJson as string | undefined,
        controlEndpoint: opts.controlEndpoint as string | undefined,
        clearAimJson: opts.clearAimJson as boolean | undefined,
        clearControlEndpoint: opts.clearControlEndpoint as boolean | undefined,
        clearAliases: opts.clearAliases as boolean | undefined,
        alias: opts.alias as string[] | undefined,
        source: opts.source as string | undefined,
        sourceRef: opts.sourceRef as string | undefined,
        reason: opts.reason as string | undefined,
        actor: opts.actor as string | undefined,
        expectedRevision: opts.expectedRevision ? Number(opts.expectedRevision) : undefined,
        apply: opts.apply as boolean | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose })),
    }));

  for (const [operation, description] of [
    ['retire', 'Retire a Site record while preserving a reversible tombstone'],
    ['restore', 'Restore a retired Site record to the active catalog'],
    ['purge', 'Permanently remove retired registry metadata without deleting the Site root'],
  ] as const) {
    const command = registryCmd
      .command(`${operation} <site-id-or-alias>`)
      .description(description)
      .requiredOption('--reason <reason>', 'Reason for the registry state change')
      .option('--actor <id>', 'Operator or agent identity')
      .option('--expected-revision <n>', 'Reject apply if the row revision changed')
      .option('--confirm-site-id <id>', 'Required for purge; must equal the canonical Site id')
      .option('--apply', 'Apply the planned registry change', false)
      .option('--dry-run', 'Explicitly request planning without mutation', false)
      .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
      .option('-v, --verbose', 'Enable verbose output', false);
    command.action(directCommandAction<[string, CommanderOptionValues]>({
      command: `sites registry ${operation}`,
      emit: emitCommandResult,
      format: (_reference: string, opts: CommanderOptionValues) => opts.format,
      invocation: (reference, opts) => sitesRegistryStateCommand(operation, {
        reference,
        reason: opts.reason as string | undefined,
        actor: opts.actor as string | undefined,
        expectedRevision: opts.expectedRevision ? Number(opts.expectedRevision) : undefined,
        confirmSiteId: opts.confirmSiteId as string | undefined,
        apply: opts.apply as boolean | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose })),
    }));
  }

  sitesCmd
    .command('launch <site-id>')
    .description('Ensure a Site\'s declared runtime posture (resident carrier, MCP surfaces, scheduler, console)')
    .option('--dry-run', 'Plan and check only; no mutation', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'sites launch',
      emit: emitCommandResult,
      format: (_siteId: string, opts: CommanderOptionValues) => opts.format,
      invocation: (siteId, opts) => sitesLaunchCommand({
        siteId,
        dryRun: opts.dryRun as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose })),
    }));

  sitesCmd
    .command('setup')
    .description('Interactively set up a Narada Site, or run setup from explicit Site coordinates')
    .option('--config <path>', 'Create-site config JSON')
    .option('-i, --interactive', 'Prompt for Site coordinates and descriptor capabilities')
    .option('--preset <preset>', 'Greenfield template preset: minimal, agent-site-core, agent-memory, task-lifecycle, or site-machinery')
    .option('--site-id <id>', 'Site id for shorthand setup')
    .option('--root <path>', 'Site root for shorthand setup')
    .option('--site-kind <kind>', 'Site kind for shorthand setup', 'project')
    .option('--authority-locus <locus>', 'Authority locus for shorthand setup', 'project')
    .option('--dry-run', 'Preview without creating a Site', false)
    .option('--execute-live', 'After creating the Site skeleton, run admitted live carriers in sequence', false)
    .option('--live-authority-basis <basis>', 'Authority basis for --execute-live carrier applies')
    .option('--output-plan <path>', 'Write the dry-run plan JSON artifact')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesSetupCommand({
        config: opts.config as string | undefined,
        interactive: opts.interactive as boolean | undefined,
        preset: opts.preset as string | undefined,
        siteId: opts.siteId as string | undefined,
        root: opts.root as string | undefined,
        siteKind: opts.siteKind as string | undefined,
        authorityLocus: opts.authorityLocus as string | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        executeLive: opts.executeLive as boolean | undefined,
        liveAuthorityBasis: opts.liveAuthorityBasis as string | undefined,
        outputPlan: opts.outputPlan as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFiniteCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('create')
    .description('Plan greenfield Narada Site creation from Narada proper templates/catalog')
    .option('--config <path>', 'Create-site config JSON')
    .option('-i, --interactive', 'Prompt for Site coordinates and descriptor capabilities', false)
    .option('--preset <preset>', 'Greenfield template preset: minimal, agent-site-core, agent-memory, task-lifecycle, or site-machinery')
    .option('--site-id <id>', 'Site id for shorthand create-site planning')
    .option('--root <path>', 'Site root for shorthand create-site planning')
    .option('--site-kind <kind>', 'Site kind for shorthand create-site planning', 'project')
    .option('--authority-locus <locus>', 'Authority locus for shorthand create-site planning', 'project')
    .option('--dry-run', 'Preview without creating a Site', false)
    .option('--execute-live', 'After creating the Site skeleton, run admitted live carriers in sequence', false)
    .option('--live-authority-basis <basis>', 'Authority basis for --execute-live carrier applies')
    .option('--output-plan <path>', 'Write the dry-run plan JSON artifact')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesCreateCommand({
        config: opts.config as string | undefined,
        interactive: opts.interactive as boolean | undefined,
        preset: opts.preset as string | undefined,
        siteId: opts.siteId as string | undefined,
        root: opts.root as string | undefined,
        siteKind: opts.siteKind as string | undefined,
        authorityLocus: opts.authorityLocus as string | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        executeLive: opts.executeLive as boolean | undefined,
        liveAuthorityBasis: opts.liveAuthorityBasis as string | undefined,
        outputPlan: opts.outputPlan as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFiniteCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('create-presets')
    .description('List greenfield create-site presets from the Narada proper template catalog')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesCreatePresetsCommand({
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFiniteCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('live-carrier')
    .description('Run an admitted greenfield create-Site live carrier with explicit authority gates')
    .requiredOption('--carrier <id>', 'Carrier id: site_local_db_init, site_local_storage_hydration, agent_context_memory_local_storage, site_inbox_local_substrate, site_config_local_registry, site_lift_local_adoption, site_mcp_registration_transport, windows_profile_site_binding')
    .option('--mode <mode>', 'Carrier mode: plan, apply, verify, or recover', 'plan')
    .requiredOption('--target-site-root <path>', 'Receiving Site root')
    .requiredOption('--site-id <id>', 'Receiving Site id')
    .requiredOption('--authority-basis <basis>', 'Explicit receiving authority basis')
    .option('--source-site-root <path>', 'Optional source Site root for refusal checks')
    .option('--runtime-target <target>', 'Runtime target for MCP registration')
    .option('--mcp-server-json <json>', 'MCP server descriptors JSON array')
    .option('--profile-artifact-path <path>', 'Target-local profile artifact path')
    .option('--profile-target <target>', 'Profile target label')
    .option('--db-verified', 'Declare DB carrier verification evidence is present', false)
    .option('--storage-verified', 'Declare storage carrier verification evidence is present', false)
    .option('--db-init-verified', 'Declare DB init verification evidence is present', false)
    .option('--mcp-registration-verified', 'Declare MCP registration verification evidence is present', false)
    .option('--profile-can-precede-mcp-registration', 'Allow profile binding to precede MCP registration verification', false)
    .option('--mutation-authorized', 'Authorize apply mode under receiving Site/profile authority', false)
    .option('--handoff-as-checkpoint-truth', 'Test/refuse handoff-as-checkpoint-truth posture', false)
    .option('--import-source-runtime-state', 'Test/refuse source runtime import posture', false)
    .option('--include-secrets', 'Test/refuse secret capture posture', false)
    .option('--register-mcp', 'Test/refuse MCP registration from profile carrier', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesLiveCarrierCommand({
        carrier: opts.carrier as string | undefined,
        mode: opts.mode as string | undefined,
        targetSiteRoot: opts.targetSiteRoot as string | undefined,
        siteId: opts.siteId as string | undefined,
        authorityBasis: opts.authorityBasis as string | undefined,
        sourceSiteRoot: opts.sourceSiteRoot as string | undefined,
        runtimeTarget: opts.runtimeTarget as string | undefined,
        mcpServerJson: opts.mcpServerJson as string | undefined,
        profileArtifactPath: opts.profileArtifactPath as string | undefined,
        profileTarget: opts.profileTarget as string | undefined,
        dbVerified: opts.dbVerified as boolean | undefined,
        storageVerified: opts.storageVerified as boolean | undefined,
        dbInitVerified: opts.dbInitVerified as boolean | undefined,
        mcpRegistrationVerified: opts.mcpRegistrationVerified as boolean | undefined,
        profileCanPrecedeMcpRegistration: opts.profileCanPrecedeMcpRegistration as boolean | undefined,
        mutationAuthorized: opts.mutationAuthorized as boolean | undefined,
        handoffAsCheckpointTruth: opts.handoffAsCheckpointTruth as boolean | undefined,
        importSourceRuntimeState: opts.importSourceRuntimeState as boolean | undefined,
        includeSecrets: opts.includeSecrets as boolean | undefined,
        registerMcp: opts.registerMcp as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFiniteCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('list')
    .description('List discovered Sites with health status')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(wrapCommand('sites-list', (opts, ctx) =>
      sitesListCommand({ format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto', verbose: opts.verbose }, ctx)));

  sitesCmd
    .command('discover')
    .description('Plan or apply canonical registry discovery')
    .option('--actor <id>', 'Operator or agent identity')
    .option('--apply', 'Apply discovery changes; without this flag only a preview is returned', false)
    .option('--dry-run', 'Explicitly request planning without mutation', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(wrapCommand('sites-discover', (opts, ctx) =>
      sitesDiscoverCommand({
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
        verbose: opts.verbose,
        actor: opts.actor as string | undefined,
        apply: opts.apply as boolean | undefined,
        dryRun: opts.dryRun as boolean | undefined,
      }, ctx)));

  const depsCmd = sitesCmd
    .command('deps')
    .description('Manage shared Narada package links and provenance for a Site');

  depsCmd
    .command('sync')
    .description('Synchronize shared Narada package workspace links and write Site package provenance')
    .option('--root <path>', 'Site root or containing workspace root', '.')
    .option('--apply', 'Create or repair package links and provenance', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesDepsSyncCommand({
        root: opts.root as string | undefined,
        apply: opts.apply as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFiniteCommandResult(result, { format: opts.format });
    });

  const reconcileCmd = sitesCmd
    .command('reconcile')
    .description('Repair generated Site-local surfaces from Narada proper package templates');

  reconcileCmd
    .command('agent-cli-wrapper')
    .description('Reconcile the Start-AgentCliSession.ps1 client/projection wrapper from the packaged @narada2/agent-cli template')
    .option('--root <path>', 'Site root or containing workspace root', '.')
    .option('--apply', 'Write the reconciled wrapper', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesReconcileAgentCliWrapperCommand({
        root: opts.root as string | undefined,
        apply: opts.apply as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  reconcileCmd
    .command('tool-surface-manifest')
    .description('Reconcile site-tool-surface.manifest.json from the current Site-local tools tree')
    .option('--root <path>', 'Site root or containing workspace root', '.')
    .option('--apply', 'Write the reconciled manifest', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesReconcileToolSurfaceManifestCommand({
        root: opts.root as string | undefined,
        apply: opts.apply as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  const auditCmd = sitesCmd
    .command('audit')
    .description('Read-only coherence audits over Site declarations');

  auditCmd
    .command('tool-surface-duplicates')
    .description('Find duplicated site_owned executable hashes across Sites')
    .option('--root <path...>', 'Site root or containing workspace root; repeat or pass several values')
    .option('--limit <n>', 'Maximum duplicate groups/candidates to show', '20')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesAuditToolSurfaceDuplicatesCommand({
        root: opts.root as string[] | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  auditCmd
    .command('tool-surfaces')
    .description('Audit Site-owned tool surface duplication and cutover burden across Sites')
    .option('--root <path...>', 'Site root or containing workspace root; repeat or pass several values')
    .option('--limit <n>', 'Maximum duplicate groups/candidates to show', '20')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesAuditToolSurfaceDuplicatesCommand({
        root: opts.root as string[] | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('agent-bootstrap <site-id-or-root>')
    .description('Show the bounded Architect, Builder, or Observer bootstrap contract for a Site')
    .requiredOption('--role <role>', 'Role to inspect: architect, builder, or observer')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (siteIdOrRoot: string, opts: CommanderOptionValues) => {
      const result = await sitesAgentBootstrapCommand(siteIdOrRoot, {
        role: opts.role as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  const taskLifecycleCmd = sitesCmd
    .command('task-lifecycle')
    .description('Site-local task lifecycle operators');

  taskLifecycleCmd
    .command('init')
    .description('Initialize SQLite-backed task lifecycle machinery inside an explicit Site path')
    .requiredOption('--site <path>', 'Target Site root path')
    .option('--dry-run', 'Preview without making changes', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesTaskLifecycleInitCommand({
        site: opts.site as string | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  const lifecycleCmd = sitesCmd
    .command('lifecycle')
    .description('Inspect governed Site lifecycle transformation machinery');

  lifecycleCmd
    .command('kinds')
    .description('List governed Site lifecycle transformation kinds')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesLifecycleKindsCommand({
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  lifecycleCmd
    .command('preflight <kind>')
    .description('Preflight a Site lifecycle transformation without mutation')
    .option('--source-site <ref>', 'Source Site id or path')
    .option('--target-site <ref>', 'Target Site id or path')
    .option('--authority-mode <mode>', 'Authority mode for this transformation')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (kind: string, opts: CommanderOptionValues) => {
      const result = await sitesLifecyclePreflightCommand({
        kind,
        sourceSite: opts.sourceSite as string | undefined,
        targetSite: opts.targetSite as string | undefined,
        authorityMode: opts.authorityMode as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  const executeCmd = lifecycleCmd
    .command('execute')
    .description('Execute governed Site lifecycle transformations as durable artifacts');

  executeCmd
    .command('absorb')
    .description('Execute Site absorption v0 by writing plan, lineage, and relation artifacts')
    .requiredOption('--source-site <ref>', 'Source Site id or path')
    .requiredOption('--target-site <ref>', 'Target Site id or path')
    .option('--authority-mode <mode>', 'Authority mode for absorb v0', 'admission_review')
    .option('--admitted-material <csv>', 'Comma-separated material admitted or referenced')
    .option('--evidence-ref <csv>', 'Comma-separated evidence references')
    .option('--retained-authority <csv>', 'Comma-separated authority classes retained by source')
    .requiredOption('--by <id>', 'Principal executing the lifecycle transform')
    .option('--execute', 'Write durable artifacts; omitted means dry-run', false)
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'sites lifecycle execute absorb',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => sitesLifecycleExecuteAbsorbCommand({
        sourceSite: opts.sourceSite as string | undefined,
        targetSite: opts.targetSite as string | undefined,
        authorityMode: opts.authorityMode as string | undefined,
        admittedMaterial: opts.admittedMaterial as string | undefined,
        evidenceRef: opts.evidenceRef as string | undefined,
        retainedAuthority: opts.retainedAuthority as string | undefined,
        by: opts.by as string | undefined,
        execute: opts.execute as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose })),
    }));

  const lineageCmd = sitesCmd
    .command('lineage')
    .description('Inspect governed Site provenance lineage vocabulary');

  lineageCmd
    .command('events')
    .description('List Site provenance lineage event types and authority effects')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesLineageEventsCommand({
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  const relationCmd = sitesCmd
    .command('relation')
    .description('Record and validate durable Site relation evidence');

  relationCmd
    .command('record')
    .description('Record a Site relation edge without mutating Site authority or config')
    .requiredOption('--kind <kind>', 'Relation kind: absorbed, absorbed_by, references, routes_to, subscribes_to, publishes_to')
    .requiredOption('--source-site <ref>', 'Source Site reference')
    .requiredOption('--target-site <ref>', 'Target Site reference')
    .option('--authority-effect <effect>', 'Authority effect, defaults from relation kind')
    .option('--admitted-material <csv>', 'Comma-separated material admitted or referenced')
    .option('--evidence-ref <csv>', 'Comma-separated evidence references')
    .option('--lineage-event-ref <csv>', 'Comma-separated lineage event references')
    .option('--reciprocal-required', 'Require a reciprocal active relation edge', false)
    .option('--reciprocal-relation-id <id>', 'Explicit reciprocal relation id')
    .requiredOption('--by <id>', 'Principal recording the relation')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'sites relation record',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => sitesRelationRecordCommand({
        kind: opts.kind as string | undefined,
        sourceSite: opts.sourceSite as string | undefined,
        targetSite: opts.targetSite as string | undefined,
        authorityEffect: opts.authorityEffect as string | undefined,
        admittedMaterial: opts.admittedMaterial as string | undefined,
        evidenceRef: opts.evidenceRef as string | undefined,
        lineageEventRef: opts.lineageEventRef as string | undefined,
        reciprocalRequired: opts.reciprocalRequired as boolean | undefined,
        reciprocalRelationId: opts.reciprocalRelationId as string | undefined,
        by: opts.by as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  relationCmd
    .command('list')
    .description('List durable Site relation records')
    .option('--kind <kind>', 'Filter by relation kind')
    .option('--source-site <ref>', 'Filter by source Site')
    .option('--target-site <ref>', 'Filter by target Site')
    .option('--status <status>', 'Filter by status')
    .option('--limit <n>', 'Maximum relations', '20')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'sites relation list',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => sitesRelationListCommand({
        kind: opts.kind as string | undefined,
        sourceSite: opts.sourceSite as string | undefined,
        targetSite: opts.targetSite as string | undefined,
        status: opts.status as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  relationCmd
    .command('validate')
    .description('Validate reciprocal and authority posture of Site relation records')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'sites relation validate',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => sitesRelationValidateCommand({
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  relationCmd
    .command('explain <relation-id>')
    .description('Explain a Site relation authority and reciprocal posture')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'sites relation explain',
      emit: emitCommandResult,
      format: (_relationId: string, opts: CommanderOptionValues) => opts.format,
      invocation: (relationId, opts) => sitesRelationExplainCommand({
        relationId,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  const authorityCmd = sitesCmd
    .command('authority')
    .description('Inspect Site authority locus before sanctioned mutation');

  authorityCmd
    .command('preflight')
    .description('Preflight whether a mutation would occur at the declared authority locus')
    .option('--cwd <path>', 'Working directory to inspect', '.')
    .option('--mutation-family <family>', 'Mutation family: task_lifecycle, inbox, publication, secret, or site', 'task_lifecycle')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'sites authority preflight',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => siteMutationAuthorityPreflightCommand({
        cwd: opts.cwd as string | undefined,
        mutationFamily: opts.mutationFamily as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  const immuneCmd = sitesCmd
    .command('immune')
    .description('Observe Site authority zones for tamper-suspected posture without repair');

  immuneCmd
    .command('scan')
    .description('Read-only immune sensing over Site authority surfaces')
    .option('--cwd <path>', 'Site root to inspect', '.')
    .option('--limit <n>', 'Maximum findings to return', '50')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'sites immune scan',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => siteImmuneScanCommand({
        cwd: opts.cwd as string | undefined,
        limit: Number(opts.limit),
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  sitesCmd
    .command('doctor <site-id>')
    .description('Validate a Site root and authority posture')
    .option('--root <path>', 'Site workspace/root path to inspect')
    .option('--authority-locus <locus>', 'Windows authority locus: user or pc')
    .option('--kind <kind>', 'Site kind: windows, client, or project', 'windows')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (siteId: string, opts: CommanderOptionValues) => {
      const result = await sitesDoctorCommand(siteId, {
        root: opts.root as string | undefined,
        authorityLocus: opts.authorityLocus as string | undefined,
        kind: opts.kind as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFiniteCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('show <site-id>')
    .description('Show Site metadata and last-known health')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (siteId: string, opts: CommanderOptionValues) => {
      const result = await sitesShowCommand(siteId, {
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('remove <site-id>')
    .description('Deprecated alias for registry retire; does NOT delete Site files')
    .requiredOption('--reason <reason>', 'Reason for retiring the registry record')
    .option('--actor <id>', 'Operator or agent identity')
    .option('--apply', 'Apply the retirement; without this flag only a preview is returned', false)
    .option('--dry-run', 'Explicitly request planning without mutation', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (siteId: string, opts: CommanderOptionValues) => {
      const result = await sitesRemoveCommand(siteId, {
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
        reason: opts.reason as string,
        actor: opts.actor as string | undefined,
        apply: opts.apply as boolean | undefined,
        dryRun: opts.dryRun as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('init <site-id>')
    .description('Initialize a new Narada Site')
    .requiredOption('--substrate <name>', 'Substrate: windows-native, windows-wsl, macos, linux-user, linux-system')
    .option('--operation <id>', 'Operation ID to bind')
    .option('--root <path>', 'Override Site root directory')
    .option('--authority-locus <locus>', 'Windows authority locus: user or pc')
    .option('--sync <posture>', 'Windows user Site sync posture')
    .option('--execution-surface <surface>', 'Execution surface: windows_native, wsl_assisted, wsl_native, linux_user, linux_system, macos_native')
    .option('--dry-run', 'Preview without making changes', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (siteId: string, opts: CommanderOptionValues) => {
      const result = await sitesInitCommand(siteId, {
        substrate: opts.substrate as string,
        operation: opts.operation as string | undefined,
        root: opts.root as string | undefined,
        authorityLocus: opts.authorityLocus as string | undefined,
        sync: opts.sync as string | undefined,
        executionSurface: opts.executionSurface as string | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('bootstrap-client')
    .description('Plan or execute contained client Site bootstrap')
    .requiredOption('--workspace <path>', 'Client workspace root')
    .option('--site-id <id>', 'Client Site id; defaults from workspace name')
    .option('--sync <posture>', 'Client sync posture: onedrive_non_git or local_non_git')
    .option('--execute', 'Perform mutations; default is dry-run', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesBootstrapClientCommand({
        workspace: opts.workspace as string | undefined,
        siteId: opts.siteId as string | undefined,
        sync: opts.sync as string | undefined,
        execute: opts.execute as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('bootstrap-project')
    .description('Plan or execute contained project Site bootstrap inside an existing project repo')
    .requiredOption('--workspace <path>', 'Project workspace/repository root')
    .option('--site-id <id>', 'Project Site id; defaults from workspace name')
    .option('--sync <posture>', 'Project sync posture: git_backed_project_repo', 'git_backed_project_repo')
    .option('--execute', 'Perform mutations; default is dry-run', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesBootstrapProjectCommand({
        workspace: opts.workspace as string | undefined,
        siteId: opts.siteId as string | undefined,
        sync: opts.sync as string | undefined,
        execute: opts.execute as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('bootstrap-windows')
    .description('Plan or execute paired Windows User/PC Site bootstrap; adapter mutations remain planned-only')
    .option('--user-site-id <id>', 'Windows user-locus Site id')
    .option('--pc-site-id <id>', 'Windows PC-locus Site id')
    .option('--sync <posture>', 'Windows User Site sync posture', 'hybrid_capable_plain_folder')
    .option('--execution-surface <surface>', 'Execution surface override')
    .option('--execute', 'Perform mutations; default is dry-run', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await sitesBootstrapWindowsCommand({
        userSiteId: opts.userSiteId as string | undefined,
        pcSiteId: opts.pcSiteId as string | undefined,
        sync: opts.sync as string | undefined,
        executionSurface: opts.executionSurface as string | undefined,
        execute: opts.execute as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('enable <site-id>')
    .description('Enable unattended supervisor for a Site')
    .option('--interval-minutes <n>', 'Cycle interval in minutes', '5')
    .option('--dry-run', 'Preview without making changes', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (siteId: string, opts: CommanderOptionValues) => {
      const result = await sitesEnableCommand(siteId, {
        intervalMinutes: opts.intervalMinutes ? Number(opts.intervalMinutes) : undefined,
        dryRun: opts.dryRun as boolean | undefined,
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });
}
