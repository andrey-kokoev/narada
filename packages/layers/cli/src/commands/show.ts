import { resolve } from 'node:path';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { loadConfig, isMultiMailboxConfig, loadMultiMailboxConfig } from '@narada2/control-plane';

export interface ShowOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  scope?: string;
  type: 'evaluation' | 'decision' | 'execution';
  id: string;
}

export async function showCommand(
  options: ShowOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, logger } = context;

  logger.info('Loading config', { path: configPath });

  let raw: string;
  try {
    const { readFile } = await import('node:fs/promises');
    raw = await readFile(configPath, 'utf8');
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: 'Failed to read config: ' + (error as Error).message,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: 'Failed to parse config: ' + (error as Error).message,
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
        result: {
          status: 'error',
          error: options.scope ? `Mailbox not found: ${options.scope}` : 'No mailboxes configured',
        },
      };
    }

    return inspectEntity(
      targetMailbox.mailbox_id,
      resolve(targetMailbox.root_dir),
      options.type,
      options.id,
      options.format,
      logger,
    );
  }

  const config = await loadConfig({ path: configPath });

  let scope: typeof config.scopes[0] | undefined;
  if (options.scope) {
    scope = config.scopes.find((s) => s.scope_id === options.scope);
    if (!scope) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: `Operation not found: ${options.scope}` },
      };
    }
  } else {
    scope = config.scopes[0];
  }

  if (!scope) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'No operations configured' },
    };
  }

  return inspectEntity(scope.scope_id, resolve(scope.root_dir), options.type, options.id, options.format, logger);
}

async function inspectEntity(
  scopeId: string,
  rootDir: string,
  type: ShowOptions['type'],
  id: string,
  format: string | undefined,
  logger: CommandContext['logger'],
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const dbPath = join(rootDir, '.narada', 'coordinator.db');

  try {
    const dbStat = await stat(dbPath);
    if (!dbStat.isFile()) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Coordinator database not found at ${dbPath}` },
      };
    }
  } catch {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Coordinator database not found at ${dbPath}` },
    };
  }

  const {
    Database,
    getEvaluationDetail,
    getDecisionDetail,
    getExecutionDetail,
  } = await import('@narada2/control-plane');

  const db = new Database(dbPath);
  try {
    let detail: unknown;

    switch (type) {
      case 'evaluation': {
        detail = getEvaluationDetail({ db }, id);
        break;
      }
      case 'decision': {
        detail = getDecisionDetail({ db }, id);
        break;
      }
      case 'execution': {
        detail = getExecutionDetail({ db }, id);
        break;
      }
    }

    if (!detail) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `${type} not found: ${id}` },
      };
    }

    logger.info(`Found ${type}`, { id, scope_id: scopeId });

    const isJson = format === 'json' || (!format && !process.stdout.isTTY);
    if (isJson) {
      return {
        exitCode: ExitCode.SUCCESS,
        result: { status: 'success', scope_id: scopeId, type, [type]: detail },
      };
    }

    // Human-readable output
    const lines: string[] = [];
    lines.push(`\n${type.toUpperCase()}: ${id}`);
    lines.push(`Operation: ${scopeId}`);
    lines.push('');

    if (type === 'evaluation') {
      const d = detail as import('@narada2/control-plane').EvaluationDetail;
      lines.push(`Evaluation ID:  ${d.evaluation_id}`);
      lines.push(`Execution ID:   ${d.execution_id}`);
      lines.push(`Work Item ID:   ${d.work_item_id}`);
      lines.push(`Context ID:     ${d.context_id}`);
      lines.push(`Charter:        ${d.charter_id}`);
      lines.push(`Role:           ${d.role}`);
      lines.push(`Outcome:        ${d.outcome}`);
      lines.push(`Summary:        ${d.summary}`);
      lines.push(`Recommended:    ${d.recommended_action_class ?? '(none)'}`);
      lines.push(`Analyzed At:    ${d.analyzed_at}`);
      lines.push('');
      lines.push('── Proposed Actions ──');
      lines.push(JSON.stringify(d.proposed_actions, null, 2));
      lines.push('');
      lines.push('── Confidence ──');
      lines.push(JSON.stringify(d.confidence, null, 2));
      lines.push('');
      lines.push('── Classifications ──');
      lines.push(JSON.stringify(d.classifications, null, 2));
      lines.push('');
      lines.push('── Facts ──');
      lines.push(JSON.stringify(d.facts, null, 2));
      lines.push('');
      lines.push('── Escalations ──');
      lines.push(JSON.stringify(d.escalations, null, 2));
      lines.push('');
      lines.push('── Tool Requests ──');
      lines.push(JSON.stringify(d.tool_requests, null, 2));
    } else if (type === 'decision') {
      const d = detail as import('@narada2/control-plane').DecisionDetail;
      lines.push(`Decision ID:      ${d.decision_id}`);
      lines.push(`Context ID:       ${d.context_id}`);
      lines.push(`Approved Action:  ${d.approved_action}`);
      lines.push(`Rationale:        ${d.rationale}`);
      lines.push(`Decided At:       ${d.decided_at}`);
      lines.push(`Outbound ID:      ${d.outbound_id ?? '(none)'}`);
      lines.push(`Created By:       ${d.created_by}`);
      lines.push(`Source Charters:  ${d.source_charter_ids.join(', ') || '(none)'}`);
      lines.push('');
      lines.push('── Payload ──');
      lines.push(JSON.stringify(d.payload, null, 2));
    } else if (type === 'execution') {
      const d = detail as import('@narada2/control-plane').ExecutionDetail;
      lines.push(`Execution ID:     ${d.execution_id}`);
      lines.push(`Work Item ID:     ${d.work_item_id}`);
      lines.push(`Revision ID:      ${d.revision_id}`);
      lines.push(`Session ID:       ${d.session_id ?? '(none)'}`);
      lines.push(`Status:           ${d.status}`);
      lines.push(`Started At:       ${d.started_at}`);
      lines.push(`Completed At:     ${d.completed_at ?? '(incomplete)'}`);
      lines.push(`Error:            ${d.error_message ?? '(none)'}`);
      lines.push('');
      lines.push('── Runtime Envelope ──');
      lines.push(JSON.stringify(d.runtime_envelope, null, 2));
      lines.push('');
      lines.push('── Outcome ──');
      lines.push(JSON.stringify(d.outcome, null, 2));
    }

    return {
      exitCode: ExitCode.SUCCESS,
      result: { _formatted: lines.join('\n') },
    };
  } finally {
    db.close();
  }
}
