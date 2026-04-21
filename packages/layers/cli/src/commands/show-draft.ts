import { resolve, join } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  loadConfig,
  isMultiMailboxConfig,
  loadMultiMailboxConfig,
} from '@narada2/control-plane';

export interface ShowDraftOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  outboundId: string;
}

export async function showDraftCommand(
  options: ShowDraftOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, verbose } = context;
  const fmt = createFormatter({ format: options.format, verbose });

  let raw: string;
  try {
    raw = await (await import('node:fs/promises')).readFile(configPath, 'utf8');
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'Failed to read config: ' + (error as Error).message },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'Failed to parse config: ' + (error as Error).message },
    };
  }

  const scopeIds: string[] = [];
  const rootDirs: string[] = [];

  if (isMultiMailboxConfig(parsed)) {
    const { config, valid } = await loadMultiMailboxConfig({ path: configPath });
    if (!valid) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: 'Invalid multi-mailbox configuration' },
      };
    }
    for (const mailbox of config.mailboxes) {
      scopeIds.push(mailbox.mailbox_id);
      rootDirs.push(resolve(mailbox.root_dir));
    }
  } else {
    const config = await loadConfig({ path: configPath });
    for (const scope of config.scopes) {
      scopeIds.push(scope.scope_id);
      rootDirs.push(resolve(scope.root_dir));
    }
  }

  if (scopeIds.length === 0) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'No operations configured' },
    };
  }

  const { Database, SqliteCoordinatorStore, SqliteOutboundStore, getDraftReviewDetail } =
    await import('@narada2/control-plane');

  for (let i = 0; i < scopeIds.length; i++) {
    const dbPath = join(rootDirs[i]!, '.narada', 'coordinator.db');
    let db: import('better-sqlite3').Database | null = null;
    try {
      db = new Database(dbPath);
      const coordinatorStore = new SqliteCoordinatorStore({ db });
      const outboundStore = new SqliteOutboundStore({ db });

      const detail = getDraftReviewDetail(outboundStore, coordinatorStore, options.outboundId);
      if (!detail) continue;

      if (fmt.getFormat() === 'json') {
        return {
          exitCode: ExitCode.SUCCESS,
          result: { status: 'success', draft: detail },
        };
      }

      // Human-readable output
      const lines: string[] = [];
      lines.push(`\nDraft: ${detail.outbound_id}`);
      lines.push(`Operation: ${detail.scope_id}`);
      lines.push(`Context: ${detail.context_id}`);
      lines.push('');

      lines.push('── Status ──');
      lines.push(`  Lifecycle:    ${detail.status}`);
      lines.push(`  Review:       ${detail.review_status}`);
      lines.push(`  Created:      ${detail.created_at}`);
      if (detail.submitted_at) lines.push(`  Submitted:    ${detail.submitted_at}`);
      if (detail.confirmed_at) lines.push(`  Confirmed:    ${detail.confirmed_at}`);
      lines.push('');

      lines.push('── Content ──');
      lines.push(`  Action Type:  ${detail.action_type}`);
      if (detail.subject) lines.push(`  Subject:      ${detail.subject}`);
      if (detail.to && detail.to.length > 0) lines.push(`  To:           ${detail.to.join(', ')}`);
      if (detail.body_preview) lines.push(`  Body Preview: ${detail.body_preview.slice(0, 200)}${detail.body_preview.length > 200 ? '...' : ''}`);
      lines.push('');

      if (detail.decision_id) {
        lines.push('── Decision ──');
        lines.push(`  Decision ID:  ${detail.decision_id}`);
        lines.push(`  Approved:     ${detail.approved_action ?? '(none)'}`);
        lines.push(`  Rationale:    ${detail.decision_rationale ?? '(none)'}`);
        lines.push(`  Decided At:   ${detail.decided_at ?? '(unknown)'}`);
        lines.push('');
      }

      if (detail.evaluation_id) {
        lines.push('── Evaluation ──');
        lines.push(`  Evaluation ID: ${detail.evaluation_id}`);
        lines.push(`  Charter:       ${detail.charter_id ?? '(unknown)'}`);
        lines.push(`  Outcome:       ${detail.evaluation_outcome ?? '(unknown)'}`);
        lines.push(`  Summary:       ${detail.evaluation_summary ?? '(none)'}`);
        lines.push(`  Analyzed At:   ${detail.analyzed_at ?? '(unknown)'}`);
        lines.push('');
      }

      if (detail.reviewed_at || detail.reviewer_notes) {
        lines.push('── Review ──');
        if (detail.reviewed_at) lines.push(`  Reviewed At:  ${detail.reviewed_at}`);
        if (detail.reviewer_notes) lines.push(`  Notes:        ${detail.reviewer_notes}`);
        lines.push('');
      }

      if (detail.approved_at) {
        lines.push('── Approval ──');
        lines.push(`  Approved At:  ${detail.approved_at}`);
        lines.push('');
      }

      if (detail.terminal_reason) {
        lines.push('── Terminal ──');
        lines.push(`  Reason:       ${detail.terminal_reason}`);
        if (detail.external_reference) lines.push(`  Reference:    ${detail.external_reference}`);
        lines.push('');
      }

      if (detail.available_actions.length > 0) {
        lines.push('── Available Actions ──');
        for (const action of detail.available_actions) {
          const cmd = action.replace(/_/g, '-');
          lines.push(`  narada ${cmd} ${detail.outbound_id}`);
        }
        lines.push('');
      }

      return {
        exitCode: ExitCode.SUCCESS,
        result: { _formatted: lines.join('\n'), draft: detail },
      };
    } catch (error) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: (error as Error).message },
      };
    } finally {
      if (db) db.close();
    }
  }

  return {
    exitCode: ExitCode.GENERAL_ERROR,
    result: { status: 'error', error: `Outbound command ${options.outboundId} not found in any scope` },
  };
}
