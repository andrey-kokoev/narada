import type { Command } from 'commander';
import { directCommandAction, silentCommandContext } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import {
  carrierControlPathCommand,
  carrierDrainCommand,
  carrierReadinessCommand,
  carrierReloadCommand,
  carrierRestartCommand,
  carrierStartCommand,
  carrierStatusCommand,
} from './carrier.js';

export function registerCarrierCommands(program: Command): void {
  const carrier = program
    .command('carrier')
    .description('Compatibility runtime launch/session commands; prefer operator-surface runtime start for new NARS launches');

  carrier
    .command('status')
    .description('Inspect latest runtime launch-result evidence for a Site agent')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--agent <id>', 'Agent identity to inspect')
    .option('--runtime <runtime>', 'Runtime substrate filter')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'carrier status',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => carrierStatusCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        agent: opts.agent as string | undefined,
        runtime: opts.runtime as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  carrier
    .command('control-path')
    .description('Print the latest NARS control.jsonl path for a Site agent')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--agent <id>', 'Agent identity to inspect')
    .option('--runtime <runtime>', 'Runtime substrate filter')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'carrier control-path',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => carrierControlPathCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        agent: opts.agent as string | undefined,
        runtime: opts.runtime as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  carrier
    .command('readiness')
    .description('Return bounded runtime readiness from latest launch-result evidence')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--agent <id>', 'Agent identity to inspect')
    .option('--runtime <runtime>', 'Runtime substrate filter')
    .option('--timeout <seconds>', 'Readiness timeout seconds', '0')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'carrier readiness',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => carrierReadinessCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        agent: opts.agent as string | undefined,
        runtime: opts.runtime as string | undefined,
        timeout: opts.timeout ? Number(opts.timeout) : undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  carrier
    .command('start [carrier]')
    .description('Compatibility alias for operator-surface runtime start')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--workspace-root <path>', 'Workspace root for the launched runtime')
    .option('--agent <id>', 'Agent identity')
    .option('--carrier <carrier>', 'Compatibility alias for operator surface')
    .option('--runtime <runtime>', 'Runtime substrate for the selected operator surface')
    .option('--intelligence-provider <provider>', 'NARS operator-surface intelligence provider')
    .option('--dry-run', 'Plan the runtime launch without writing launch artifacts or spawning', false)
    .option('--materialize-only', 'Write launch artifacts without spawning the runtime', false)
    .option('--exec', 'Spawn the runtime process after materializing launch artifacts', false)
    .option('--wait', 'Wait for an operator keypress before spawning the runtime', false)
    .option('--enable-native-shell', 'Break-glass: do not disable Codex native shell_tool', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string | undefined, Record<string, unknown>]>({
      command: 'carrier start',
      emit: emitCommandResult,
      format: (_carrier: string | undefined, opts: Record<string, unknown>) => opts.format,
      invocation: (carrier, opts) => carrierStartCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        workspaceRoot: opts.workspaceRoot as string | undefined,
        agent: opts.agent as string | undefined,
        carrier: (opts.carrier as string | undefined) ?? carrier,
        runtime: opts.runtime as string | undefined,
        intelligenceProvider: opts.intelligenceProvider as string | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        materializeOnly: opts.materializeOnly as boolean | undefined,
        exec: opts.exec as boolean | undefined,
        wait: opts.wait as boolean | undefined,
        enableNativeShell: opts.enableNativeShell as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  carrier
    .command('restart [carrier]')
    .description('Reserved compatibility restart command; reports plan until live mutation is wired')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--agent <id>', 'Agent identity')
    .option('--carrier <carrier>', 'Compatibility alias for operator surface')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string | undefined, Record<string, unknown>]>({
      command: 'carrier restart',
      emit: emitCommandResult,
      format: (_carrier: string | undefined, opts: Record<string, unknown>) => opts.format,
      invocation: (carrier, opts) => carrierRestartCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        agent: opts.agent as string | undefined,
        carrier: (opts.carrier as string | undefined) ?? carrier,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  carrier
    .command('reload [carrier]')
    .description('Report runtime reload capability and refusal evidence when unavailable')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--agent <id>', 'Agent identity')
    .option('--carrier <carrier>', 'Compatibility alias for operator surface')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string | undefined, Record<string, unknown>]>({
      command: 'carrier reload',
      emit: emitCommandResult,
      format: (_carrier: string | undefined, opts: Record<string, unknown>) => opts.format,
      invocation: (carrier, opts) => carrierReloadCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        agent: opts.agent as string | undefined,
        carrier: (opts.carrier as string | undefined) ?? carrier,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  carrier
    .command('drain [carrier]')
    .description('Run a bounded drain of Site resident work before lifecycle changes')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <path>', 'Alias for --site-root')
    .option('--agent <id>', 'Agent identity')
    .option('--carrier <carrier>', 'Compatibility alias for operator surface')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string | undefined, Record<string, unknown>]>({
      command: 'carrier drain',
      emit: emitCommandResult,
      format: (_carrier: string | undefined, opts: Record<string, unknown>) => opts.format,
      invocation: (carrier, opts) => carrierDrainCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        agent: opts.agent as string | undefined,
        carrier: (opts.carrier as string | undefined) ?? carrier,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
