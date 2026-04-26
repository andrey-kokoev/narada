import type { Command } from 'commander';
import {
  wantMailbox,
  wantWorkflow,
  wantPosture,
  setup,
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
    .option('--primary-charter <charter>')
    .option('--secondary-charters <charters>')
    .option('--posture <preset>')
    .option('--graph-user-id <id>', 'Graph API user ID (defaults to mailbox ID)')
    .option('--folders <list>', 'Comma-separated folder list (defaults to inbox)', 'inbox')
    .option('--data-root-dir <path>', 'Data root directory for this operation')
    .description('Declare a mailbox operation')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'want-mailbox',
      emit: emitCommandResult,
      invocation: async (mailboxId, opts) => {
        const result = wantMailbox(mailboxId, {
          configPath: opts.config as string | undefined,
          primaryCharter: opts.primaryCharter as string | undefined,
          secondaryCharters: opts.secondaryCharters ? String(opts.secondaryCharters).split(',') : undefined,
          posture: opts.posture as string | undefined,
          graphUserId: opts.graphUserId as string | undefined,
          folders: opts.folders ? String(opts.folders).split(',') : undefined,
          dataRootDir: opts.dataRootDir as string | undefined,
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
        const output = renderTargetPreflight(scopeId, {
          configPath: opts.config as string | undefined,
        });
        return {
          exitCode: ExitCode.SUCCESS,
          result: resultWithOutput({ status: 'success', operation: scopeId }, output),
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
