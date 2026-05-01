import type { Command } from 'commander';
import { directCommandAction, silentCommandContext } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import {
  operatorSurfaceAgentInstantiateCommand,
  operatorSurfaceAgentForkCommand,
  operatorSurfaceBindingDeferredCommand,
  operatorSurfaceBindFocusedCommand,
  operatorSurfaceIdentityAdmitTaskAuthorityCommand,
  operatorSurfaceIdentityAddCommand,
  operatorSurfaceIdentityRenameCommand,
  operatorSurfaceInspectCompactCommand,
  operatorSurfaceLabelsBuildCommand,
  operatorSurfaceSendCommand,
  operatorSurfaceStatusCommand,
  operatorSurfaceVoiceTranscriptionCheckCommand,
} from './operator-surface.js';

export function registerOperatorSurfaceCommands(program: Command): void {
  const surfaceCmd = program
    .command('operator-surface')
    .description('Operator Surface identity and runtime binding operators');

  const agentCmd = surfaceCmd.command('agent').description('High-level Operator Surface agent paths');
  agentCmd
    .command('instantiate')
    .description('Admit/reuse a Site role identity and emit bootstrap handoff text')
    .requiredOption('--site <site-id-or-root>', 'Site id or root for the agent surface')
    .requiredOption('--role <role>', 'Role to instantiate: architect, builder, or observer')
    .requiredOption('--agent-kind <kind>', 'Runtime/agent kind, e.g. codex_cli, kimi_cli')
    .requiredOption('--by <principal>', 'Principal requesting/admitting identity')
    .option('--identity <id>', 'Override durable identity id')
    .option('--label <label>', 'UI label projection for new identity')
    .option('--site-affinity-color <color>', 'Optional ergonomic color hint for the Site line')
    .option('--role-affinity-color <color>', 'Optional ergonomic color hint for the role line')
    .option('--input-capabilities <csv>', 'Input capabilities: focus,type_text,submit,clear_pending_input,recover_surface_state')
    .option('--submit-strategy <strategy>', 'Submit strategy: type_only, operator_confirmed_submit, known_surface_submit', 'type_only')
    .option('--dry-run', 'Preview without identity mutation', false)
    .option('--bind-focused', 'Request focused runtime binding; defers to owning runtime locus', false)
    .option('--runtime-locus <locus>', 'Owning User/PC runtime locus for binding deferral')
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'operator-surface agent instantiate',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => operatorSurfaceAgentInstantiateCommand({
        site: opts.site as string | undefined,
        role: opts.role as string | undefined,
        agentKind: opts.agentKind as string | undefined,
        by: opts.by as string | undefined,
        identityName: opts.identity as string | undefined,
        label: opts.label as string | undefined,
        siteAffinityColor: opts.siteAffinityColor as string | undefined,
        roleAffinityColor: opts.roleAffinityColor as string | undefined,
        inputCapabilities: opts.inputCapabilities as string | undefined,
        submitStrategy: opts.submitStrategy as string | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        bindFocused: opts.bindFocused as boolean | undefined,
        runtimeLocus: opts.runtimeLocus as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  agentCmd
    .command('fork')
    .description('Prepare a governed operator-surface child-agent handoff/adoption packet')
    .requiredOption('--site <site-id-or-root>', 'Site plane for the child agent')
    .requiredOption('--role <role>', 'Role to fork: architect, builder, or observer')
    .requiredOption('--agent-kind <kind>', 'Runtime/agent kind, e.g. codex_cli')
    .option('--identity <id>', 'Override durable identity id')
    .option('--task <number>', 'Task number backing the child-agent prompt')
    .option('--work-packet <ref>', 'External work packet reference when no task number exists')
    .option('--runtime-locus <locus>', 'Owning User/PC/runtime locus for process launch')
    .requiredOption('--by <principal>', 'Principal requesting the fork')
    .option('--exec', 'Request process launch; still defers to owning runtime locus in Narada proper', false)
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'operator-surface agent fork',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => operatorSurfaceAgentForkCommand({
        site: opts.site as string | undefined,
        role: opts.role as string | undefined,
        agentKind: opts.agentKind as string | undefined,
        identityName: opts.identity as string | undefined,
        taskNumber: opts.task as string | undefined,
        workPacket: opts.workPacket as string | undefined,
        runtimeLocus: opts.runtimeLocus as string | undefined,
        by: opts.by as string | undefined,
        exec: opts.exec as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  const identityCmd = surfaceCmd.command('identity').description('Durable Operator Surface identities');
  identityCmd
    .command('add <identity-name>')
    .description('Admit or update a durable Operator Surface identity')
    .requiredOption('--role <role>', 'Role represented by this identity')
    .requiredOption('--agent-kind <kind>', 'Runtime/agent kind, e.g. codex_cli, kimi_cli, api_agent')
    .requiredOption('--site <site-id>', 'Site whose identity authority admits this identity')
    .requiredOption('--by <principal>', 'Principal admitting the identity')
    .option('--label <label>', 'UI label projection')
    .option('--site-affinity-color <color>', 'Optional ergonomic color hint for the Site line')
    .option('--role-affinity-color <color>', 'Optional ergonomic color hint for the role line')
    .option('--input-capabilities <csv>', 'Input capabilities: focus,type_text,submit,clear_pending_input,recover_surface_state')
    .option('--submit-strategy <strategy>', 'Submit strategy: type_only, operator_confirmed_submit, known_surface_submit', 'type_only')
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'operator-surface identity add',
      emit: emitCommandResult,
      format: (_identityName: string, opts: Record<string, unknown>) => opts.format,
      invocation: (identityName, opts) => operatorSurfaceIdentityAddCommand({
        identityName,
        role: opts.role as string | undefined,
        agentKind: opts.agentKind as string | undefined,
        site: opts.site as string | undefined,
        by: opts.by as string | undefined,
        label: opts.label as string | undefined,
        siteAffinityColor: opts.siteAffinityColor as string | undefined,
        roleAffinityColor: opts.roleAffinityColor as string | undefined,
        inputCapabilities: opts.inputCapabilities as string | undefined,
        submitStrategy: opts.submitStrategy as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  identityCmd
    .command('rename')
    .description('Governedly migrate an Operator Surface identity without rewriting historical evidence')
    .requiredOption('--from <identity-id>', 'Existing durable identity id')
    .requiredOption('--to <identity-id>', 'New durable identity id')
    .requiredOption('--by <principal>', 'Principal authorizing the migration')
    .option('--label <label>', 'Optional replacement visible label')
    .option('--allow-active-assignment', 'Intentionally migrate current roster pointer for active work', false)
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'operator-surface identity rename',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => operatorSurfaceIdentityRenameCommand({
        fromIdentity: opts.from as string | undefined,
        toIdentity: opts.to as string | undefined,
        by: opts.by as string | undefined,
        label: opts.label as string | undefined,
        allowActiveAssignment: opts.allowActiveAssignment as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  identityCmd
    .command('admit-task-authority <identity-name>')
    .description('Admit an Operator Surface identity into task roster/review authority without collapsing aliases')
    .requiredOption('--by <principal>', 'Principal admitting task authority')
    .option('--role <role>', 'Task authority role override; defaults to Operator Surface role')
    .option('--capabilities <csv>', 'Task authority capabilities; defaults from role')
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'operator-surface identity admit-task-authority',
      emit: emitCommandResult,
      format: (_identityName: string, opts: Record<string, unknown>) => opts.format,
      invocation: (identityName, opts) => operatorSurfaceIdentityAdmitTaskAuthorityCommand({
        identityName,
        by: opts.by as string | undefined,
        role: opts.role as string | undefined,
        capabilities: opts.capabilities as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  const labelsCmd = surfaceCmd.command('labels').description('Operator Surface label projections');
  labelsCmd
    .command('build')
    .description('Build bounded UI-ready labels from admitted identities')
    .option('--site <site-id>', 'Filter by Site')
    .option('--limit <n>', 'Maximum labels', '50')
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'operator-surface labels build',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => operatorSurfaceLabelsBuildCommand({
        site: opts.site as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  const inspectCmd = surfaceCmd.command('inspect').description('Operator Surface compact inspection surfaces');
  inspectCmd
    .command('compact')
    .description('Return schema-stable compact identity, label, and binding posture for Architect loops')
    .option('--site <site-id>', 'Filter by Site')
    .option('--limit <n>', 'Maximum identities', '50')
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'operator-surface inspect compact',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => operatorSurfaceInspectCompactCommand({
        site: opts.site as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  surfaceCmd
    .command('status')
    .description('Join Operator Surface identity, binding, roster, and work status')
    .option('--site <site-id>', 'Filter by Site')
    .option('--limit <n>', 'Maximum identities', '50')
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'operator-surface status',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => operatorSurfaceStatusCommand({
        site: opts.site as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  surfaceCmd
    .command('send')
    .description('Validate or record bounded input send through an admitted Operator Surface binding')
    .option('--from <sender>', 'Message sender/principal (defaults to operator)')
    .option('--to <recipient>', 'Message recipient address; bare roles are scoped to --current-site, cross-Site recipients must be Site-qualified')
    .option('--current-site <site-id>', 'Current Site plane for bare role recipients')
    .option('--identity <id-or-alias>', 'Deprecated recipient alias for --to; retained for transition')
    .requiredOption('--text <text>', 'Text to send; secret-like text is refused')
    .option('--runtime-locus <locus>', 'Owning User/PC runtime locus')
    .option('--dry-run', 'Validate binding and strategy without recording send evidence', false)
    .option('--execute', 'Record bounded send evidence for the owning runtime locus', false)
    .option('--raw-input', 'Treat text as raw input/keystrokes and suppress the typed-message sender header', false)
    .option('--operator-activity-state <state>', 'Observed Operator activity: idle, active_typing, active_pointer, or unknown')
    .option('--operator-activity-observed-at <iso>', 'Timestamp for the activity observation')
    .option('--active-delivery <policy>', 'When Operator is active: queue, refuse, or fallback_to_inbox', 'queue')
    .option('--delivery-timeout-ms <ms>', 'Queue timeout before expiring delivery intent')
    .option('--urgent-interrupt-authority <ref>', 'Explicit authority reference permitting interruption during Operator activity')
    .option('--current-desktop <id>', 'Observed current desktop/workspace before delivery')
    .option('--target-desktop <id>', 'Target binding desktop/workspace')
    .option('--cross-desktop-policy <policy>', 'Cross-desktop posture: same_desktop_only, allow_with_authority, or refuse', 'same_desktop_only')
    .option('--cross-desktop-authority <ref>', 'Explicit authority reference permitting cross-desktop summon/switch')
    .option('--activation-result <result>', 'Observed focus/activation attempt result: success or failed', 'success')
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'operator-surface send',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => operatorSurfaceSendCommand({
        identity: opts.identity as string | undefined,
        from: opts.from as string | undefined,
        to: opts.to as string | undefined,
        currentSite: opts.currentSite as string | undefined,
        text: opts.text as string | undefined,
        runtimeLocus: opts.runtimeLocus as string | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        execute: opts.execute as boolean | undefined,
        rawInput: opts.rawInput as boolean | undefined,
        operatorActivityState: opts.operatorActivityState as string | undefined,
        operatorActivityObservedAt: opts.operatorActivityObservedAt as string | undefined,
        activeDelivery: opts.activeDelivery as string | undefined,
        deliveryTimeoutMs: opts.deliveryTimeoutMs as string | undefined,
        urgentInterruptAuthority: opts.urgentInterruptAuthority as string | undefined,
        currentDesktop: opts.currentDesktop as string | undefined,
        targetDesktop: opts.targetDesktop as string | undefined,
        crossDesktopPolicy: opts.crossDesktopPolicy as string | undefined,
        crossDesktopAuthority: opts.crossDesktopAuthority as string | undefined,
        activationResult: opts.activationResult as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  const voiceCmd = surfaceCmd.command('voice').description('Operator Surface voice input readiness operators');
  voiceCmd
    .command('transcription-check')
    .description('Check governed voice transcription credential and capability posture without sending audio')
    .requiredOption('--site <site-id>', 'Site whose operator surface owns the voice input')
    .requiredOption('--principal <principal>', 'Principal requesting transcription')
    .option('--capability-grant-id <id>', 'Specific voice.transcription.remote grant to use')
    .option('--credential-ref <ref>', 'Credential reference override, e.g. env:VAR or credential-manager:target')
    .option('--mic-only', 'Check local microphone-only posture; no remote transcription or credential required', false)
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'operator-surface voice transcription-check',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => operatorSurfaceVoiceTranscriptionCheckCommand({
        site: opts.site as string | undefined,
        principal: opts.principal as string | undefined,
        capabilityGrantId: opts.capabilityGrantId as string | undefined,
        credentialRef: opts.credentialRef as string | undefined,
        micOnly: opts.micOnly as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  surfaceCmd
    .command('bind-focused')
    .description('Prepare focused runtime-handle binding; defers mutation to owning runtime locus')
    .option('--identity <id>', 'Durable identity to bind')
    .option('--as <kind>', 'Resolve identity as self')
    .option('--runtime-locus <locus>', 'Owning User/PC runtime locus')
    .option('--handle <handle>', 'Explicit observed runtime handle; defaults to CODEX_THREAD_ID, WT_SESSION, or process pid')
    .option('--stale-after <timestamp>', 'Optional ISO timestamp after which the binding is stale')
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'operator-surface bind-focused',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => operatorSurfaceBindFocusedCommand({
        identity: opts.identity as string | undefined,
        as: opts.as as string | undefined,
        runtimeLocus: opts.runtimeLocus as string | undefined,
        handle: opts.handle as string | undefined,
        staleAfter: opts.staleAfter as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  surfaceCmd
    .command('rebind')
    .description('Runtime binding rebind request; deferred to owning runtime locus')
    .option('--identity <id>', 'Durable identity')
    .option('--runtime-locus <locus>', 'Owning User/PC runtime locus')
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'operator-surface rebind',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => operatorSurfaceBindingDeferredCommand('rebind', {
        identity: opts.identity as string | undefined,
        runtimeLocus: opts.runtimeLocus as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  surfaceCmd
    .command('unbind-focused')
    .description('Runtime binding unbind request; deferred to owning runtime locus')
    .option('--runtime-locus <locus>', 'Owning User/PC runtime locus')
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'operator-surface unbind-focused',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => operatorSurfaceBindingDeferredCommand('unbind', {
        runtimeLocus: opts.runtimeLocus as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  const bindingsCmd = surfaceCmd.command('bindings').description('Runtime binding projections');
  bindingsCmd
    .command('list')
    .description('List runtime bindings; deferred unless run in owning runtime locus')
    .option('--runtime-locus <locus>', 'Owning User/PC runtime locus')
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'operator-surface bindings list',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => operatorSurfaceBindingDeferredCommand('list', {
        runtimeLocus: opts.runtimeLocus as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  bindingsCmd
    .command('clean-stale')
    .description('Clean stale runtime bindings; deferred to owning runtime locus')
    .option('--runtime-locus <locus>', 'Owning User/PC runtime locus')
    .option('--cwd <path>', 'Site root / working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'operator-surface bindings clean-stale',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => operatorSurfaceBindingDeferredCommand('clean-stale', {
        runtimeLocus: opts.runtimeLocus as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
