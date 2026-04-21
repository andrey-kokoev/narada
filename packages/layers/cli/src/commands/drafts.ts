/**
 * `narada drafts`
 *
 * Mailbox-specific draft overview — focused, grouped by status,
 * with counts and available actions. Faster than `narada ops` when
 * you only care about outbound draft state.
 */

import { resolve, join } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  loadConfig,
  isMultiMailboxConfig,
  loadMultiMailboxConfig,
} from '@narada2/control-plane';

export interface DraftsOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  limit?: number;
}

interface DraftRow {
  outbound_id: string;
  action_type: string;
  context_id: string;
  status: string;
  created_at: string;
  subject: string | null;
  payload_json: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  decision_rationale: string | null;
  charter_summary: string | null;
}

interface DraftSummary {
  scopeId: string;
  rootDir: string;
  capturedAt: string;
  counts: Record<string, number>;
  active: DraftRow[];
  readyForReview: DraftRow[];
  approvedForSend: DraftRow[];
  inFlight: DraftRow[];
  blocked: DraftRow[];
  terminal: DraftRow[];
  stuck: DraftRow[];
}

function deriveReviewStatus(row: DraftRow): string {
  if (row.approved_at) return 'approved_for_send';
  if (row.reviewed_at) return 'reviewed';
  return 'awaiting_review';
}

function deriveAvailableActions(row: DraftRow): string[] {
  const actions: string[] = [];
  if (row.status === 'draft_ready') {
    actions.push('mark-reviewed', 'reject-draft', 'handled-externally');
    if (row.action_type === 'send_reply' || row.action_type === 'send_new_message') {
      actions.push('approve-draft-for-send');
    }
  }
  if (row.status === 'blocked_policy') {
    actions.push('reject-draft');
  }
  if (row.status === 'failed_terminal') {
    actions.push('retry-auth-failed');
  }
  return actions;
}

function extractPayloadSummary(row: DraftRow): string | undefined {
  if (row.subject) return row.subject;
  if (!row.payload_json) return undefined;
  try {
    const payload = JSON.parse(row.payload_json) as { body_preview?: string };
    return payload.body_preview;
  } catch {
    return undefined;
  }
}

function isStuck(row: DraftRow): boolean {
  const ageMinutes = (Date.now() - new Date(row.created_at).getTime()) / 60000;
  switch (row.status) {
    case 'pending':
      return ageMinutes > 15;
    case 'draft_creating':
      return ageMinutes > 10;
    case 'draft_ready':
      return ageMinutes > 24 * 60;
    case 'sending':
      return ageMinutes > 5;
    default:
      return false;
  }
}

async function loadDraftsReport(
  scopeId: string,
  rootDir: string,
  limit: number,
): Promise<DraftSummary> {
  const { Database, SqliteCoordinatorStore, SqliteOutboundStore } = await import(
    '@narada2/control-plane'
  );
  const db = new Database(join(rootDir, '.narada', 'coordinator.db'));
  const capturedAt = new Date().toISOString();

  try {
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    const outboundStore = new SqliteOutboundStore({ db });

    const rows = outboundStore.db
      .prepare(
        `select
           oh.outbound_id, oh.action_type, oh.context_id, oh.status,
           oh.created_at, oh.reviewed_at, oh.approved_at,
           ov.payload_json, ov.subject,
           fd.rationale as decision_rationale,
           ev.summary as charter_summary
         from outbound_handoffs oh
         join outbound_versions ov on oh.outbound_id = ov.outbound_id and oh.latest_version = ov.version
         left join foreman_decisions fd on fd.outbound_id = oh.outbound_id
         left join evaluations ev on ev.context_id = oh.context_id and ev.scope_id = oh.scope_id
         where oh.scope_id = ?
         order by oh.created_at desc`
      )
      .all(scopeId) as DraftRow[];

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }

    const active = rows.filter((r) => r.status === 'pending' || r.status === 'draft_creating');
    const readyForReview = rows.filter((r) => r.status === 'draft_ready');
    const approvedForSend = rows.filter((r) => r.status === 'approved_for_send');
    const inFlight = rows.filter((r) => r.status === 'sending' || r.status === 'submitted');
    const blocked = rows.filter(
      (r) => r.status === 'blocked_policy' || r.status === 'retry_wait' || r.status === 'failed_terminal'
    );
    const terminal = rows.filter(
      (r) => r.status === 'confirmed' || r.status === 'cancelled' || r.status === 'superseded'
    );
    const stuck = rows.filter(isStuck).slice(0, limit);

    return {
      scopeId,
      rootDir,
      capturedAt,
      counts,
      active: active.slice(0, limit),
      readyForReview: readyForReview.slice(0, limit),
      approvedForSend: approvedForSend.slice(0, limit),
      inFlight: inFlight.slice(0, limit),
      blocked: blocked.slice(0, limit),
      terminal: terminal.slice(0, limit),
      stuck,
    };
  } finally {
    db.close();
  }
}

export async function draftsCommand(
  options: DraftsOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, logger } = context;
  const limit = options.limit ?? 20;
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });

  logger.info('Loading config', { path: configPath });

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

  const reports: DraftSummary[] = [];

  if (isMultiMailboxConfig(parsed)) {
    const { config, valid } = await loadMultiMailboxConfig({ path: configPath });
    if (!valid) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: 'Invalid multi-mailbox configuration' },
      };
    }
    for (const mailbox of config.mailboxes) {
      reports.push(await loadDraftsReport(mailbox.mailbox_id, resolve(mailbox.root_dir), limit));
    }
  } else {
    let config;
    try {
      config = await loadConfig({ path: configPath });
    } catch (error) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: 'Failed to load config: ' + (error as Error).message },
      };
    }
    for (const scope of config.scopes) {
      reports.push(await loadDraftsReport(scope.scope_id, resolve(scope.root_dir), limit));
    }
  }

  if (fmt.getFormat() === 'json') {
    return { exitCode: ExitCode.SUCCESS, result: { status: 'success', reports } };
  }

  for (const report of reports) {
    fmt.section(`Drafts — ${report.scopeId}`);
    fmt.kv('Captured', report.capturedAt);

    // Summary counts
    fmt.section('Summary');
    const total = Object.values(report.counts).reduce((a, b) => a + b, 0);
    fmt.kv('Total', String(total));
    fmt.kv('Active', String((report.counts['pending'] ?? 0) + (report.counts['draft_creating'] ?? 0)));
    fmt.kv('Ready for Review', String(report.counts['draft_ready'] ?? 0));
    fmt.kv('Approved for Send', String(report.counts['approved_for_send'] ?? 0));
    fmt.kv('In Flight', String((report.counts['sending'] ?? 0) + (report.counts['submitted'] ?? 0)));
    fmt.kv('Blocked / Failed', String(
      (report.counts['blocked_policy'] ?? 0) +
      (report.counts['retry_wait'] ?? 0) +
      (report.counts['failed_terminal'] ?? 0)
    ));
    fmt.kv('Terminal', String(
      (report.counts['confirmed'] ?? 0) +
      (report.counts['cancelled'] ?? 0) +
      (report.counts['superseded'] ?? 0)
    ));

    if (report.stuck.length > 0) {
      fmt.section('⚠ Stuck Drafts');
      fmt.table(
        [
          { key: 'id', label: 'ID', width: 18 },
          { key: 'status', label: 'Status', width: 14 },
          { key: 'action', label: 'Action', width: 12 },
          { key: 'age', label: 'Age', width: 16 },
        ],
        report.stuck.map((r) => ({
          id: r.outbound_id.slice(0, 16),
          status: r.status,
          action: r.action_type,
          age: r.created_at,
        })),
      );
    }

    const sections: Array<{ title: string; rows: DraftRow[]; showActions?: boolean }> = [
      { title: 'Active', rows: report.active },
      { title: 'Ready for Review', rows: report.readyForReview, showActions: true },
      { title: 'Approved for Send', rows: report.approvedForSend },
      { title: 'In Flight', rows: report.inFlight },
      { title: 'Blocked / Failed', rows: report.blocked, showActions: true },
      { title: 'Terminal', rows: report.terminal },
    ];

    for (const section of sections) {
      if (section.rows.length === 0) continue;
      fmt.section(section.title);
      fmt.table(
        [
          { key: 'id', label: 'ID', width: 18 },
          { key: 'action', label: 'Action', width: 12 },
          { key: 'review', label: 'Review', width: 14 },
          { key: 'summary', label: 'Summary', width: 28 },
          ...(section.showActions ? [{ key: 'actions' as const, label: 'Actions', width: 24 }] : []),
        ],
        section.rows.map((r) => ({
          id: r.outbound_id.slice(0, 16),
          action: r.action_type,
          review: deriveReviewStatus(r),
          summary: (extractPayloadSummary(r) ?? r.charter_summary ?? '-').slice(0, 26),
          ...(section.showActions ? { actions: deriveAvailableActions(r).join(', ').slice(0, 22) } : {}),
        })),
      );
    }

    if (report.active.length === 0 &&
        report.readyForReview.length === 0 &&
        report.approvedForSend.length === 0 &&
        report.inFlight.length === 0 &&
        report.blocked.length === 0 &&
        report.terminal.length === 0) {
      fmt.message('No drafts found.', 'info');
    }
  }

  return { exitCode: ExitCode.SUCCESS, result: { status: 'success', reports } };
}
