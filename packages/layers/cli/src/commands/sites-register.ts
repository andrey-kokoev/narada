import type { Command } from 'commander';
import {
  sitesListCommand,
  sitesDiscoverCommand,
  sitesShowCommand,
  sitesRemoveCommand,
  sitesDoctorCommand,
  sitesInitCommand,
  sitesBootstrapClientCommand,
  sitesBootstrapWindowsCommand,
  sitesEnableCommand,
  sitesTaskLifecycleInitCommand,
  sitesLifecycleKindsCommand,
  sitesLifecyclePreflightCommand,
  sitesLineageEventsCommand,
} from './sites.js';
import { siteMutationAuthorityPreflightCommand } from './site-mutation-authority-preflight.js';
import { directCommandAction, silentCommandContext, wrapCommand } from '../lib/command-wrapper.js';
import { emitCommandResult, emitFormatterBackedCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerSitesCommands(program: Command): void {
  const sitesCmd = program
    .command('sites')
    .description('Discover and manage Narada Sites');

  sitesCmd
    .command('list')
    .description('List discovered Sites with health status')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(wrapCommand('sites-list', (opts, ctx) =>
      sitesListCommand({ format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto', verbose: opts.verbose }, ctx)));

  sitesCmd
    .command('discover')
    .description('Scan filesystem and refresh registry')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(wrapCommand('sites-discover', (opts, ctx) =>
      sitesDiscoverCommand({ format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto', verbose: opts.verbose }, ctx)));

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
    .action(async (opts: Record<string, unknown>) => {
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
    .action(async (opts: Record<string, unknown>) => {
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
    .action(async (kind: string, opts: Record<string, unknown>) => {
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

  const lineageCmd = sitesCmd
    .command('lineage')
    .description('Inspect governed Site provenance lineage vocabulary');

  lineageCmd
    .command('events')
    .description('List Site provenance lineage event types and authority effects')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: Record<string, unknown>) => {
      const result = await sitesLineageEventsCommand({
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  const authorityCmd = sitesCmd
    .command('authority')
    .description('Inspect Site authority locus before sanctioned mutation');

  authorityCmd
    .command('preflight')
    .description('Preflight whether a mutation would occur at the declared authority locus')
    .option('--cwd <path>', 'Working directory to inspect', '.')
    .option('--mutation-family <family>', 'Mutation family: task_lifecycle, inbox, publication, secret, or site', 'task_lifecycle')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'sites authority preflight',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => siteMutationAuthorityPreflightCommand({
        cwd: opts.cwd as string | undefined,
        mutationFamily: opts.mutationFamily as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  sitesCmd
    .command('doctor <site-id>')
    .description('Validate a Site root and authority posture')
    .option('--root <path>', 'Site workspace/root path to inspect')
    .option('--authority-locus <locus>', 'Windows authority locus: user or pc')
    .option('--kind <kind>', 'Site kind: windows or client', 'windows')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (siteId: string, opts: Record<string, unknown>) => {
      const result = await sitesDoctorCommand(siteId, {
        root: opts.root as string | undefined,
        authorityLocus: opts.authorityLocus as string | undefined,
        kind: opts.kind as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('show <site-id>')
    .description('Show Site metadata and last-known health')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (siteId: string, opts: Record<string, unknown>) => {
      const result = await sitesShowCommand(siteId, {
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  sitesCmd
    .command('remove <site-id>')
    .description('Remove a Site from the registry (does NOT delete Site files)')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (siteId: string, opts: Record<string, unknown>) => {
      const result = await sitesRemoveCommand(siteId, {
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
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
    .action(async (siteId: string, opts: Record<string, unknown>) => {
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
    .action(async (opts: Record<string, unknown>) => {
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
    .command('bootstrap-windows')
    .description('Plan or execute paired Windows User and PC Site bootstrap')
    .option('--user-site-id <id>', 'Windows user-locus Site id')
    .option('--pc-site-id <id>', 'Windows PC-locus Site id')
    .option('--sync <posture>', 'Windows User Site sync posture', 'hybrid_capable_plain_folder')
    .option('--execution-surface <surface>', 'Execution surface override')
    .option('--execute', 'Perform mutations; default is dry-run', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: Record<string, unknown>) => {
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
    .action(async (siteId: string, opts: Record<string, unknown>) => {
      const result = await sitesEnableCommand(siteId, {
        intervalMinutes: opts.intervalMinutes ? Number(opts.intervalMinutes) : undefined,
        dryRun: opts.dryRun as boolean | undefined,
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });
}
