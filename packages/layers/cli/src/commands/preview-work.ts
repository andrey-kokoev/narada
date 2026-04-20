import { resolve } from 'node:path';
import { join } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { loadConfig, isMultiMailboxConfig, loadMultiMailboxConfig } from '@narada2/control-plane';
import type { AllowedAction } from '@narada2/control-plane';

export interface PreviewWorkOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  scope?: string;
  contextId?: string;
  since?: string;
  factIds?: string[];
  mock?: boolean;
}

export async function previewWorkCommand(
  options: PreviewWorkOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, verbose, logger } = context;
  const fmt = createFormatter({ format: options.format, verbose });

  logger.info('Loading config', { path: configPath });

  let parsed: unknown;
  try {
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(configPath, 'utf8');
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: 'Failed to load config: ' + (error as Error).message,
      },
    };
  }

  if (isMultiMailboxConfig(parsed)) {
    const { config, valid } = await loadMultiMailboxConfig({ path: configPath });
    if (!valid) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: 'Invalid multi-mailbox configuration' },
      };
    }

    const targetMailbox = options.scope
      ? config.mailboxes.find((m) => m.id === options.scope)
      : config.mailboxes[0];

    if (!targetMailbox) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: options.scope ? `Mailbox not found: ${options.scope}` : 'No mailboxes configured' },
      };
    }

    return previewForScope(
      targetMailbox.mailbox_id,
      resolve(targetMailbox.root_dir),
      options,
      fmt,
      logger,
    );
  }

  const config = await loadConfig({ path: configPath });
  const scope = config.scopes.find((s) => s.scope_id === options.scope) ?? config.scopes[0];
  if (!scope) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'No operations configured' },
    };
  }

  return previewForScope(scope.scope_id, resolve(scope.root_dir), options, fmt, logger);
}

async function previewForScope(
  scopeId: string,
  rootDir: string,
  options: PreviewWorkOptions,
  fmt: ReturnType<typeof createFormatter>,
  logger: CommandContext['logger'],
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const dbDir = join(rootDir, '.narada');
  const coordinatorDbPath = join(dbDir, 'coordinator.db');
  const factsDbPath = join(dbDir, 'facts.db');

  // Lazy-load better-sqlite3 to avoid eager native-module load
  const {
    Database,
    SqliteCoordinatorStore,
    SqliteOutboundStore,
    SqliteIntentStore,
    SqliteFactStore,
    DefaultForemanFacade,
    MailboxContextStrategy,
    VerticalMaterializerRegistry,
    MailboxContextMaterializer,
    MockCharterRunner,
    FileMessageStore,
  } = await import('@narada2/control-plane');

  const db = new Database(coordinatorDbPath);
  const factDb = new Database(factsDbPath);

  try {
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    const outboundStore = new SqliteOutboundStore({ db });
    const intentStore = new SqliteIntentStore({ db });
    const factStore = new SqliteFactStore({ db: factDb });

    const getRuntimePolicy = () => {
      const record = coordinatorStore.getContextRecord(options.contextId ?? '');
      if (record) {
        const secondary = JSON.parse(record.secondary_charters_json) as string[];
        return {
          primary_charter: record.primary_charter,
          secondary_charters: secondary.length > 0 ? secondary : undefined,
          allowed_actions: ['draft_reply', 'send_reply', 'move_message', 'flag_message', 'create_task', 'update_task'] as AllowedAction[],
        };
      }
      return {
        primary_charter: 'default',
        allowed_actions: ['draft_reply', 'send_reply', 'move_message', 'flag_message', 'create_task', 'update_task'] as AllowedAction[],
      };
    };

    const foreman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: scopeId,
      getRuntimePolicy,
      contextFormationStrategy: new MailboxContextStrategy(),
    });

    const messageStore = new FileMessageStore({ rootDir });
    const materializerRegistry = new VerticalMaterializerRegistry();
    materializerRegistry.register('mail', () => new MailboxContextMaterializer(rootDir, messageStore));

    let charterRunner;
    if (options.mock) {
      charterRunner = new MockCharterRunner({
        output: {
          output_version: '2.0',
          execution_id: 'mock-preview',
          charter_id: 'support_steward',
          role: 'primary',
          analyzed_at: new Date().toISOString(),
          outcome: 'no_op',
          confidence: { overall: 'high', uncertainty_flags: [] },
          summary: 'Mock preview: no action required',
          classifications: [],
          facts: [],
          proposed_actions: [],
          tool_requests: [],
          escalations: [],
        },
      });
    } else {
      // Try to instantiate a real charter runner from environment/config
      try {
        const { CodexCharterRunner } = await import('@narada2/charters');
        const { loadCharterEnv } = await import('@narada2/control-plane');
        const env = loadCharterEnv();
        const apiKey = env.openai_api_key ?? env.kimi_api_key;
        if (!apiKey) {
          fmt.message('No API key found in environment. Use --mock for a mock preview.', 'warning');
          return {
            exitCode: ExitCode.INVALID_CONFIG,
            result: { status: 'error', error: 'No charter API key found. Set OPENAI_API_KEY or KIMI_API_KEY, or use --mock.' },
          };
        }
        charterRunner = new CodexCharterRunner(
          {
            apiKey,
          },
          {
            persistTrace: () => { /* Preview does not persist traces */ },
          },
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        fmt.message(`Failed to load charter runner: ${msg}. Use --mock for a mock preview.`, 'warning');
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: { status: 'error', error: `Failed to load charter runner: ${msg}` },
        };
      }
    }

    const facts = factStore.getFactsByScope(scopeId, {
      contextIds: options.contextId ? [options.contextId] : undefined,
      since: options.since,
      factIds: options.factIds,
      limit: 1000,
    });

    logger.info('Previewing work from stored facts', {
      scope: scopeId,
      factCount: facts.length,
      contextId: options.contextId ?? 'all',
      since: options.since ?? 'all time',
      mock: options.mock ?? false,
    });

    if (facts.length === 0) {
      fmt.message('No stored facts matched the selection criteria.', 'warning');
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          scope: scopeId,
          facts_matched: 0,
          previews: [],
          message: 'No facts matched the selection criteria.',
        },
      };
    }

    const previews = await foreman.previewWorkFromStoredFacts(
      facts,
      scopeId,
      charterRunner,
      materializerRegistry,
      { rootDir, executionIdPrefix: 'cli' },
    );

    logger.info('Preview derivation complete', {
      scope: scopeId,
      contexts: previews.length,
    });

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          scope: scopeId,
          facts_matched: facts.length,
          previews: previews.map((p) => ({
            context_id: p.context_id,
            revision_id: p.revision_id,
            charter_id: p.charter_id,
            summary: p.output.summary,
            outcome: p.output.outcome,
            confidence: p.output.confidence,
            proposed_actions: p.output.proposed_actions,
            governance: p.governance,
          })),
        },
      };
    }

    fmt.message(
      `Preview derivation complete — ${previews.length} context(s) evaluated`,
      'success',
    );
    fmt.section('Summary');
    fmt.kv('Operation', scopeId);
    fmt.kv('Facts matched', facts.length);
    fmt.kv('Contexts evaluated', previews.length);

    for (const preview of previews) {
      fmt.section(`Context: ${preview.context_id}`);
      fmt.kv('Revision', preview.revision_id);
      fmt.kv('Charter', preview.charter_id);
      fmt.kv('Outcome', preview.output.outcome);
      fmt.kv('Confidence', preview.output.confidence.overall);
      fmt.kv('Summary', preview.output.summary);
      fmt.kv('Governance', preview.governance.outcome);
      if (preview.governance.approval_required) {
        fmt.kv('Approval required', 'yes');
      }
      if (preview.governance.governance_errors.length > 0) {
        fmt.kv('Governance errors', preview.governance.governance_errors.join('; '));
      }
      if (preview.output.proposed_actions.length > 0) {
        fmt.section('Proposed actions');
        for (const action of preview.output.proposed_actions) {
          fmt.kv(action.action_type, action.rationale ?? '(no rationale)');
        }
      }
    }

    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        scope: scopeId,
        facts_matched: facts.length,
        previews: previews.map((p) => ({
          context_id: p.context_id,
          revision_id: p.revision_id,
          charter_id: p.charter_id,
          summary: p.output.summary,
          outcome: p.output.outcome,
          confidence: p.output.confidence,
          proposed_actions: p.output.proposed_actions,
          governance: p.governance,
        })),
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Preview derivation failed', { error: msg });
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  } finally {
    db.close();
    factDb.close();
  }
}
