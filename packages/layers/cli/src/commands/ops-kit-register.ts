import type { Command } from 'commander';
import {
  wantMailbox,
  wantWorkflow,
  wantPosture,
  setup,
  preflight,
  renderTargetPreflight,
  inspect,
  explain,
  activate,
  initRepo,
  type PosturePreset,
} from '@narada2/ops-kit';
import { directCommandAction } from '../lib/command-wrapper.js';
import { attachFormattedOutput, emitCommandResult, resolveCommandFormat, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';

function resultWithOutput<T extends Record<string, unknown>>(
  result: T,
  formatted: string,
  format: CliFormat = resolveCommandFormat(),
): T | (T & { _formatted: string }) {
  return attachFormattedOutput(result, formatted, format);
}

function listLines(title: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  return [title, ...lines.map((line) => `  ${line}`)];
}

function csvOption(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function formatInitRepo(result: ReturnType<typeof initRepo>): string {
  return [
    result.summary,
    '',
    ...listLines('Artifacts:', result.artifacts.map((artifact) => `[${artifact.category}] ${artifact.path} - ${artifact.description}`)),
    '',
    ...listLines('Bootstrap contract - run these next:', result.nextSteps),
    '',
    'See README.md in the repo for the full first-run guide.',
  ].join('\n');
}

function formatWantMailbox(result: ReturnType<typeof wantMailbox>): string {
  return [
    result.summary,
    '',
    ...listLines('Bootstrap contract - run these next:', result.nextSteps),
  ].join('\n');
}

function formatWantPosture(result: ReturnType<typeof wantPosture>): string {
  return [
    `${result.target}: ${result.preset} applied`,
    result.description,
  ].join('\n');
}

function formatExplain(result: ReturnType<typeof explain>): string {
  const lines = [
    `Target: ${result.target}`,
    `Why no action: ${result.whyNoAction}`,
  ];
  if (result.operationalConsequences.length > 0) {
    lines.push('Operational consequences:');
    lines.push(...result.operationalConsequences.map((line) => `- ${line}`));
  }
  if (result.blockers.length > 0) {
    lines.push('Blockers:');
    lines.push(...result.blockers.map((line) => `- ${line}`));
  }
  return lines.join('\n');
}

function formatActivateSuccess(scopeId: string, result: ReturnType<typeof activate>): string {
  return [
    `${scopeId} is now activated.`,
    'Activation marks this operation as live. It does not start the daemon or send mail.',
    `When the daemon runs, Narada will process operation ${scopeId} according to its configured policy.`,
    `Activated at: ${result.activatedAt}`,
  ].join('\n');
}

export function registerOpsKitCommands(program: Command): void {
  program
    .command('init-repo')
    .argument('<path>')
    .option('-n, --name <name>', 'Package name for the generated repo')
    .option('--local-source', 'Link to local monorepo packages instead of npm versions')
    .option('--demo', 'Create a demo repo with a pre-configured mock-backed operation (no credentials needed)', false)
    .description('Bootstrap a private Narada operations repo')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'init-repo',
      emit: emitCommandResult,
      invocation: async (repoPath, opts) => {
        const result = initRepo(repoPath, {
          name: opts.name as string | undefined,
          localSource: opts.localSource as boolean | undefined,
          demo: opts.demo as boolean | undefined,
        });
        return {
          exitCode: ExitCode.SUCCESS,
          result: resultWithOutput({ status: 'success', ...result }, formatInitRepo(result)),
        };
      },
    }));

  program
    .command('want-mailbox')
    .argument('<mailbox-id>')
    .option('-c, --config <path>')
    .option('--scope-id <id>', 'Operation scope ID (defaults to mailbox ID)')
    .option('--primary-charter <charter>')
    .option('--secondary-charters <charters>')
    .option('--posture <preset>', 'Draft/send posture preset')
    .option('--draft-send-posture <preset>', 'Alias for --posture when authoring client-service mailbox setup')
    .option('--graph-user-id <id>', 'Graph API user ID (defaults to mailbox ID)')
    .option('--mailbox-user-id <id>', 'Mailbox user ID alias for client-service setup')
    .option('--correspondence-scope-id <id>', 'Client-service correspondence scope ID')
    .option('--folders <list>', 'Comma-separated folder list (defaults to inbox)', 'inbox')
    .option('--data-root-dir <path>', 'Data root directory for this operation')
    .option('--client-service', 'Author client-service mailbox onboarding metadata and predicates', false)
    .option('--participant-domain <domains>', 'Comma-separated participant domains to admit across from/sender/to/cc/bcc')
    .option('--exclude-participant-domain <domains>', 'Comma-separated participant domains to reject across from/sender/to/cc/bcc')
    .option('--participant-fields <fields>', 'Comma-separated participant fields: from,sender,to,cc,bcc,any_participant')
    .option('--attachment-policy <policy>', 'Attachment policy: exclude, metadata_only, include_content')
    .option('--body-policy <policy>', 'Body policy: text_only, plain_text_only, html_only, text_and_html, original, best_effort')
    .option('--include-headers', 'Include message headers during normalization', false)
    .option('--material-notes-posture <posture>', 'Client-service KB/material note posture: none, site_local_kb, deferred')
    .description('Declare a mailbox operation')
    .addHelpText('after', [
      '',
      'Examples:',
      '  narada want-mailbox help@example.com --posture draft-only',
      '  narada want-mailbox support@client.com --client-service --scope-id client-correspondence --mailbox-user-id support@client.com --participant-domain client.com --attachment-policy metadata_only --draft-send-posture draft-only --material-notes-posture site_local_kb',
    ].join('\n'))
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'want-mailbox',
      emit: emitCommandResult,
      invocation: async (mailboxId, opts) => {
        const result = wantMailbox(mailboxId, {
          configPath: opts.config as string | undefined,
          scopeId: opts.scopeId as string | undefined,
          primaryCharter: opts.primaryCharter as string | undefined,
          secondaryCharters: csvOption(opts.secondaryCharters),
          posture: (opts.draftSendPosture ?? opts.posture) as string | undefined,
          graphUserId: opts.graphUserId as string | undefined,
          mailboxUserId: opts.mailboxUserId as string | undefined,
          correspondenceScopeId: opts.correspondenceScopeId as string | undefined,
          folders: csvOption(opts.folders),
          dataRootDir: opts.dataRootDir as string | undefined,
          clientService: opts.clientService as boolean | undefined,
          participantDomains: csvOption(opts.participantDomain),
          excludedParticipantDomains: csvOption(opts.excludeParticipantDomain),
          participantFields: csvOption(opts.participantFields),
          attachmentPolicy: opts.attachmentPolicy as string | undefined,
          bodyPolicy: opts.bodyPolicy as string | undefined,
          includeHeaders: opts.includeHeaders as boolean | undefined,
          materialNotesPosture: opts.materialNotesPosture as string | undefined,
        });
        return {
          exitCode: ExitCode.SUCCESS,
          result: resultWithOutput({ status: 'success', ...result }, formatWantMailbox(result)),
        };
      },
    }));

  program
    .command('want-workflow')
    .argument('<workflow-id>')
    .requiredOption('--schedule <schedule>')
    .option('-c, --config <path>')
    .option('--primary-charter <charter>')
    .option('--posture <preset>')
    .description('Declare a timer workflow operation')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'want-workflow',
      emit: emitCommandResult,
      invocation: async (workflowId, opts) => {
        const result = wantWorkflow(workflowId, {
          configPath: opts.config as string | undefined,
          primaryCharter: opts.primaryCharter as string | undefined,
          schedule: opts.schedule as string,
          posture: opts.posture as string | undefined,
        });
        return {
          exitCode: ExitCode.SUCCESS,
          result: resultWithOutput({ status: 'success', ...result }, result.summary),
        };
      },
    }));

  program
    .command('want-posture')
    .argument('<target>')
    .argument('<preset>')
    .option('-c, --config <path>')
    .description('Apply a safety posture to an operation')
    .action(directCommandAction<[string, string, Record<string, unknown>]>({
      command: 'want-posture',
      emit: emitCommandResult,
      invocation: async (target, preset, opts) => {
        const result = wantPosture(target, preset as PosturePreset, {
          configPath: opts.config as string | undefined,
        });
        return {
          exitCode: ExitCode.SUCCESS,
          result: resultWithOutput({ status: 'success', ...result }, formatWantPosture(result)),
        };
      },
    }));

  program
    .command('setup')
    .argument('[target]')
    .option('-c, --config <path>')
    .description('Scaffold directories for configured operations')
    .action(directCommandAction<[string | undefined, Record<string, unknown>]>({
      command: 'setup',
      emit: emitCommandResult,
      invocation: async (target, opts) => {
        const result = setup({
          target,
          configPath: opts.config as string | undefined,
        });
        return {
          exitCode: ExitCode.SUCCESS,
          result: resultWithOutput({ status: 'success', ...result }, result.summary),
        };
      },
    }));

  program
    .command('preflight')
    .argument('<operation>')
    .option('-c, --config <path>')
    .description('Verify operation readiness')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'preflight',
      emit: emitCommandResult,
      invocation: async (scopeId, opts) => {
        const report = preflight(scopeId, {
          configPath: opts.config as string | undefined,
        });
        const output = renderTargetPreflight(scopeId, {
          configPath: opts.config as string | undefined,
        });
        return {
          exitCode: ExitCode.SUCCESS,
          result: resultWithOutput({ ...report, status: 'success', readiness_status: report.status, operation: scopeId }, output),
        };
      },
    }));

  program
    .command('inspect')
    .argument('<operation>')
    .option('-c, --config <path>')
    .description('Show operation configuration')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'inspect',
      emit: emitCommandResult,
      invocation: async (scopeId, opts) => {
        const result = inspect(scopeId, {
          configPath: opts.config as string | undefined,
        });
        return {
          exitCode: ExitCode.SUCCESS,
          result: resultWithOutput({ status: 'success', ...result }, result.summary),
        };
      },
    }));

  program
    .command('explain')
    .argument('<operation>')
    .option('-c, --config <path>')
    .description('Explain what an operation will do')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'explain',
      emit: emitCommandResult,
      invocation: async (scopeId, opts) => {
        const result = explain(scopeId, {
          configPath: opts.config as string | undefined,
        });
        return {
          exitCode: ExitCode.SUCCESS,
          result: resultWithOutput({ status: 'success', ...result }, formatExplain(result)),
        };
      },
    }));

  program
    .command('activate')
    .argument('<operation>')
    .option('-c, --config <path>')
    .description('Mark an operation as live')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'activate',
      emit: emitCommandResult,
      invocation: async (scopeId, opts) => {
        const result = activate(scopeId, {
          configPath: opts.config as string | undefined,
        });
        if (!result.activated) {
          const reason = result.reason ?? 'Activation failed';
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: resultWithOutput({ status: 'error', ...result, error: reason }, reason),
          };
        }
        return {
          exitCode: ExitCode.SUCCESS,
          result: resultWithOutput({ status: 'success', ...result }, formatActivateSuccess(scopeId, result)),
        };
      },
    }));
}
