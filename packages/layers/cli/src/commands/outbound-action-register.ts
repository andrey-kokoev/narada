import type { Command } from 'commander';
import { rejectDraftCommand } from './reject-draft.js';
import { markReviewedCommand } from './mark-reviewed.js';
import { handledExternallyCommand } from './handled-externally.js';
import { showDraftCommand } from './show-draft.js';
import { draftsCommand } from './drafts.js';
import { approveDraftForSendCommand } from './approve-draft-for-send.js';
import { retryAuthFailedCommand } from './retry-auth-failed.js';
import { acknowledgeAlertCommand } from './acknowledge-alert.js';
import { wrapCommand } from '../lib/command-wrapper.js';

type CliFormat = 'json' | 'human' | 'auto';
type WrappedOptions = Record<string, unknown> & {
  config?: string;
  verbose?: boolean;
  format?: string;
};

function outputFormat(): CliFormat {
  return process.env.OUTPUT_FORMAT as CliFormat;
}

export function registerOutboundActionCommands(program: Command): void {
  program
    .command('reject-draft')
    .description('Reject a draft-ready outbound command')
    .argument('<outbound-id>', 'Outbound command ID to reject')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('--rationale <text>', 'Operator rationale for rejection')
    .action((outboundId: string, opts: Record<string, unknown>) =>
      wrapCommand<WrappedOptions>('reject-draft', (merged, ctx) =>
        rejectDraftCommand({
          ...merged,
          format: outputFormat(),
          outboundId,
          rationale: merged.rationale as string | undefined,
        }, ctx))({ ...opts, outboundId }));

  program
    .command('mark-reviewed')
    .description('Mark a draft-ready outbound command as reviewed')
    .argument('<outbound-id>', 'Outbound command ID to mark reviewed')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('--notes <text>', 'Reviewer notes')
    .action((outboundId: string, opts: Record<string, unknown>) =>
      wrapCommand<WrappedOptions>('mark-reviewed', (merged, ctx) =>
        markReviewedCommand({
          ...merged,
          format: outputFormat(),
          outboundId,
          notes: merged.notes as string | undefined,
        }, ctx))({ ...opts, outboundId }));

  program
    .command('handled-externally')
    .description('Record that a draft was handled outside Narada')
    .argument('<outbound-id>', 'Outbound command ID')
    .requiredOption('--ref <reference>', 'External reference (ticket ID, thread URL)')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action((outboundId: string, opts: Record<string, unknown>) =>
      wrapCommand<WrappedOptions>('handled-externally', (merged, ctx) =>
        handledExternallyCommand({
          ...merged,
          format: outputFormat(),
          outboundId,
          ref: merged.ref as string,
        }, ctx))({ ...opts, outboundId }));

  program
    .command('drafts')
    .description('Mailbox-specific draft overview - grouped by status with counts and available actions')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('-l, --limit <n>', 'Maximum drafts per group', '20')
    .action(wrapCommand('drafts', (opts, ctx) =>
      draftsCommand({
        ...opts,
        format: outputFormat(),
        limit: opts.limit ? Number(opts.limit) : undefined,
      }, ctx)));

  program
    .command('show-draft')
    .description('Show deep-dive draft review detail including lineage and available actions')
    .argument('<outbound-id>', 'Outbound command ID to inspect')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action((outboundId: string, opts: Record<string, unknown>) =>
      wrapCommand<WrappedOptions>('show-draft', (merged, ctx) =>
        showDraftCommand({
          ...merged,
          format: outputFormat(),
          outboundId,
        }, ctx))({ ...opts, outboundId }));

  program
    .command('approve-draft-for-send')
    .description('Approve a draft-ready outbound command for send execution')
    .argument('<outbound-id>', 'Outbound command ID to approve for send')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action((outboundId: string, opts: Record<string, unknown>) =>
      wrapCommand<WrappedOptions>('approve-draft-for-send', (merged, ctx) =>
        approveDraftForSendCommand({
          ...merged,
          format: outputFormat(),
          outboundId,
        }, ctx))({ ...opts, outboundId }));

  program
    .command('retry-auth-failed')
    .description('Retry outbound commands that failed due to auth errors after credentials are restored')
    .argument('[outbound-id]', 'Specific outbound command ID to retry (optional; scans all scopes if omitted)')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('-l, --limit <n>', 'Maximum commands to retry per scope when scanning', '50')
    .action((outboundId: string | undefined, opts: Record<string, unknown>) =>
      wrapCommand<WrappedOptions>('retry-auth-failed', (merged, ctx) =>
        retryAuthFailedCommand({
          ...merged,
          format: outputFormat(),
          outboundId,
          limit: merged.limit ? Number(merged.limit) : undefined,
        }, ctx))({ ...opts, outboundId }));

  program
    .command('acknowledge-alert')
    .description('Acknowledge a failed work item so it no longer appears as active operator attention')
    .argument('<work-item-id>', 'Failed work item ID to acknowledge')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action((workItemId: string, opts: Record<string, unknown>) =>
      wrapCommand<WrappedOptions>('acknowledge-alert', (merged, ctx) =>
        acknowledgeAlertCommand({
          ...merged,
          format: outputFormat(),
          workItemId,
        }, ctx))({ ...opts, workItemId }));
}
