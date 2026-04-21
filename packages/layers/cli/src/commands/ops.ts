/**
 * `narada ops`
 *
 * Operator daily dashboard — composes health, recent activity,
 * attention queue, and drafts pending review into one loop-shaped view.
 */

import { resolve } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  loadConfig,
  isMultiMailboxConfig,
  loadMultiMailboxConfig,
} from '@narada2/control-plane';

export interface OpsOptions {
  config?: string;
  format?: string;
  verbose?: boolean;
  limit?: number;
}

interface HealthSummary {
  daemonRunning?: boolean;
  syncFresh?: boolean;
  outboundHealthy?: boolean;
  charterRuntimeHealthy?: boolean;
  overall: 'healthy' | 'degraded' | 'failing' | 'unknown';
}

interface RecentActivity {
  evaluations: Array<{ id: string; charter_id: string; outcome: string; analyzed_at: string; summary?: string }>;
  decisions: Array<{ id: string; approved_action: string; decided_at: string; outbound_id?: string }>;
  executions: Array<{ id: string; status: string; started_at: string; completed_at?: string }>;
}

interface AttentionItem {
  type: 'stuck_work' | 'stuck_outbound' | 'failed';
  id: string;
  description: string;
  since: string;
}

interface DraftPendingReview {
  outbound_id: string;
  action_type: string;
  context_id: string;
  created_at: string;
  payload_summary?: string;
  review_status: string;
  decision_rationale?: string;
  charter_summary?: string;
  available_actions: string[];
}

interface OpsReport {
  scopeId: string;
  rootDir: string;
  capturedAt: string;
  health: HealthSummary;
  recentActivity: RecentActivity;
  attentionQueue: AttentionItem[];
  draftsPendingReview: DraftPendingReview[];
  suggestedActions: string[];
}

// Lazy-load better-sqlite3 to avoid eager native-module load in test environments
async function loadOpsReport(
  scopeId: string,
  rootDir: string,
  limit: number,
): Promise<OpsReport> {
  const { Database, SqliteCoordinatorStore, SqliteOutboundStore } = await import(
    '@narada2/control-plane'
  );
  const db = new Database(join(rootDir, '.narada', 'coordinator.db'));
  const capturedAt = new Date().toISOString();

  try {
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    const outboundStore = new SqliteOutboundStore({ db });

    // ── Health summary from .health.json ──
    const health: HealthSummary = { overall: 'unknown' };
    try {
      const healthPath = join(rootDir, '.health.json');
      const healthRaw = await readFile(healthPath, 'utf8');
      const healthData = JSON.parse(healthRaw) as {
        readiness?: {
          dispatchReady?: boolean;
          outboundHealthy?: boolean;
          syncFresh?: boolean;
          charterRuntimeHealthy?: boolean;
        };
      };
      if (healthData.readiness) {
        health.syncFresh = healthData.readiness.syncFresh;
        health.outboundHealthy = healthData.readiness.outboundHealthy;
        health.charterRuntimeHealthy = healthData.readiness.charterRuntimeHealthy;
      }
    } catch {
      // No health file yet
    }

    // Daemon running? Check PID file (same candidates as doctor.ts)
    const pidCandidates = [
      join(rootDir, 'daemon.pid'),
      join(rootDir, 'narada-daemon.pid'),
      './narada-daemon.pid',
      './daemon.pid',
    ];
    let daemonPid: number | null = null;
    for (const pidPath of pidCandidates) {
      try {
        const pidRaw = await readFile(pidPath, 'utf8');
        const pid = parseInt(pidRaw.trim(), 10);
        if (!isNaN(pid)) {
          daemonPid = pid;
          break;
        }
      } catch {
        // try next candidate
      }
    }
    if (daemonPid !== null) {
      try {
        process.kill(daemonPid, 0);
        health.daemonRunning = true;
      } catch {
        health.daemonRunning = false;
      }
    } else {
      health.daemonRunning = false;
    }

    // Overall health classification
    const checks = [
      health.daemonRunning,
      health.syncFresh,
      health.outboundHealthy,
      health.charterRuntimeHealthy,
    ].filter((v) => v !== undefined);
    const passes = checks.filter((v) => v === true).length;
    if (checks.length === 0) {
      health.overall = 'unknown';
    } else if (passes === checks.length) {
      health.overall = 'healthy';
    } else if (passes >= checks.length / 2) {
      health.overall = 'degraded';
    } else {
      health.overall = 'failing';
    }

    // ── Recent Activity ──
    const recentActivity: RecentActivity = {
      evaluations: [],
      decisions: [],
      executions: [],
    };

    const evalRows = coordinatorStore.db
      .prepare(
        `select evaluation_id, charter_id, outcome, analyzed_at, summary from evaluations where scope_id = ? order by analyzed_at desc limit ?`
      )
      .all(scopeId, limit) as Array<{
        evaluation_id: string;
        charter_id: string;
        outcome: string;
        analyzed_at: string;
        summary: string | null;
      }>;
    recentActivity.evaluations = evalRows.map((r) => ({
      id: r.evaluation_id,
      charter_id: r.charter_id,
      outcome: r.outcome,
      analyzed_at: r.analyzed_at,
      summary: r.summary ?? undefined,
    }));

    const decisionRows = coordinatorStore.db
      .prepare(
        `select decision_id, approved_action, decided_at, outbound_id from foreman_decisions where scope_id = ? order by decided_at desc limit ?`
      )
      .all(scopeId, limit) as Array<{
        decision_id: string;
        approved_action: string;
        decided_at: string;
        outbound_id: string | null;
      }>;
    recentActivity.decisions = decisionRows.map((r) => ({
      id: r.decision_id,
      approved_action: r.approved_action,
      decided_at: r.decided_at,
      outbound_id: r.outbound_id ?? undefined,
    }));

    const execRows = coordinatorStore.db
      .prepare(
        `select execution_id, status, started_at, completed_at from execution_attempts where scope_id = ? order by started_at desc limit ?`
      )
      .all(scopeId, limit) as Array<{
        execution_id: string;
        status: string;
        started_at: string;
        completed_at: string | null;
      }>;
    recentActivity.executions = execRows.map((r) => ({
      id: r.execution_id,
      status: r.status,
      started_at: r.started_at,
      completed_at: r.completed_at ?? undefined,
    }));

    // ── Attention Queue ──
    const attentionQueue: AttentionItem[] = [];

    // Stuck work items
    const stuckWorkRows = coordinatorStore.db
      .prepare(
        `select wi.work_item_id, wi.status, wi.updated_at, wi.created_at, wi.context_id
         from work_items wi
         where wi.scope_id = ?
           and wi.status in ('opened', 'leased', 'executing', 'failed_retryable')
           and (
             (wi.status = 'opened' and wi.created_at < datetime('now', '-60 minutes'))
             or (wi.status = 'leased' and wi.updated_at < datetime('now', '-120 minutes'))
             or (wi.status = 'executing' and wi.updated_at < datetime('now', '-30 minutes'))
             or (wi.status = 'failed_retryable' and wi.retry_count >= 3 and (wi.next_retry_at is null or wi.next_retry_at < datetime('now')))
           )
         order by wi.priority desc, wi.created_at asc`
      )
      .all(scopeId) as Array<{
        work_item_id: string;
        status: string;
        updated_at: string;
        created_at: string;
        context_id: string;
      }>;
    for (const row of stuckWorkRows) {
      attentionQueue.push({
        type: 'stuck_work',
        id: row.work_item_id,
        description: `${row.status} — ${row.context_id}`,
        since: row.status === 'opened' ? row.created_at : row.updated_at,
      });
    }

    // Failed terminal work items
    const failedRows = coordinatorStore.db
      .prepare(
        `select work_item_id, status, updated_at, context_id from work_items where scope_id = ? and status = 'failed_terminal' order by updated_at desc limit ?`
      )
      .all(scopeId, limit) as Array<{
        work_item_id: string;
        status: string;
        updated_at: string;
        context_id: string;
      }>;
    for (const row of failedRows) {
      attentionQueue.push({
        type: 'failed',
        id: row.work_item_id,
        description: `failed_terminal — ${row.context_id}`,
        since: row.updated_at,
      });
    }

    // Stuck outbound
    const stuckOutboundRows = outboundStore.db
      .prepare(
        `select oh.outbound_id, oh.status, oh.created_at, oh.action_type, oh.context_id
         from outbound_handoffs oh
         where oh.scope_id = ?
           and oh.status in ('pending', 'draft_creating', 'draft_ready', 'sending')
           and (
             (oh.status = 'pending' and oh.created_at < datetime('now', '-15 minutes'))
             or (oh.status = 'draft_creating' and oh.created_at < datetime('now', '-10 minutes'))
             or (oh.status = 'draft_ready' and oh.created_at < datetime('now', '-24 hours'))
             or (oh.status = 'sending' and oh.created_at < datetime('now', '-5 minutes'))
           )
         order by oh.created_at asc`
      )
      .all(scopeId) as Array<{
        outbound_id: string;
        status: string;
        created_at: string;
        action_type: string;
        context_id: string;
      }>;
    for (const row of stuckOutboundRows) {
      attentionQueue.push({
        type: 'stuck_outbound',
        id: row.outbound_id,
        description: `${row.status} — ${row.action_type} — ${row.context_id}`,
        since: row.created_at,
      });
    }

    // ── Drafts Pending Review ──
    const draftRows = outboundStore.db
      .prepare(
        `select
           oh.outbound_id,
           oh.action_type,
           oh.context_id,
           oh.created_at,
           oh.status,
           oh.reviewed_at,
           oh.approved_at,
           ov.payload_json,
           ov.subject,
           fd.rationale as decision_rationale,
           ev.summary as charter_summary
         from outbound_handoffs oh
         join outbound_versions ov on oh.outbound_id = ov.outbound_id and oh.latest_version = ov.version
         left join foreman_decisions fd on fd.outbound_id = oh.outbound_id
         left join evaluations ev on ev.context_id = oh.context_id and ev.scope_id = oh.scope_id
         where oh.scope_id = ? and oh.status in ('draft_ready', 'approved_for_send', 'blocked_policy')
         order by oh.created_at desc`
      )
      .all(scopeId) as Array<{
        outbound_id: string;
        action_type: string;
        context_id: string;
        created_at: string;
        status: string;
        reviewed_at: string | null;
        approved_at: string | null;
        payload_json: string;
        subject: string | null;
        decision_rationale: string | null;
        charter_summary: string | null;
      }>;
    const draftsPendingReview: DraftPendingReview[] = draftRows.map((r) => {
      let payloadSummary: string | undefined;
      try {
        const payload = JSON.parse(r.payload_json) as { subject?: string; body_preview?: string };
        payloadSummary = payload.subject ?? payload.body_preview ?? undefined;
      } catch {
        // ignore parse errors
      }

      const actions: string[] = [];
      if (r.status === 'draft_ready') {
        actions.push('mark-reviewed', 'reject-draft', 'handled-externally');
        if (r.action_type === 'send_reply' || r.action_type === 'send_new_message') {
          actions.push('approve-draft-for-send');
        }
      }
      if (r.status === 'blocked_policy') {
        actions.push('reject-draft');
      }

      let reviewStatus: string;
      if (r.approved_at) reviewStatus = 'approved_for_send';
      else if (r.reviewed_at) reviewStatus = 'reviewed';
      else reviewStatus = 'awaiting_review';

      return {
        outbound_id: r.outbound_id,
        action_type: r.action_type,
        context_id: r.context_id,
        created_at: r.created_at,
        payload_summary: r.subject ?? payloadSummary,
        review_status: reviewStatus,
        decision_rationale: r.decision_rationale ?? undefined,
        charter_summary: r.charter_summary ?? undefined,
        available_actions: actions,
      };
    });

    // ── Suggested Next Actions ──
    const suggestedActions: string[] = [];
    if (!health.daemonRunning) {
      suggestedActions.push('Start the daemon: pnpm daemon');
    }
    if (health.daemonRunning && !health.syncFresh) {
      suggestedActions.push('Sync is stale. Check logs and run: narada sync --mailbox <id>');
    }
    if (draftsPendingReview.length > 0) {
      suggestedActions.push(
        `${draftsPendingReview.length} draft(s) pending review. Inspect with: narada show-draft <outbound-id>`,
      );
    }
    const totalDrafts = draftRows.length;
    if (totalDrafts > 0) {
      suggestedActions.push(
        `Full draft overview: narada drafts`,
      );
    }
    if (failedRows.length > 0) {
      suggestedActions.push(
        `${failedRows.length} failed work item(s). Review with: narada status --verbose`
      );
    }
    if (stuckWorkRows.length > 0) {
      suggestedActions.push(
        `${stuckWorkRows.length} stuck work item(s). Consider: narada recover --scope ${scopeId} --dry-run`
      );
    }
    if (suggestedActions.length === 0) {
      suggestedActions.push('All clear. No immediate action required.');
    }

    return {
      scopeId,
      rootDir,
      capturedAt,
      health,
      recentActivity,
      attentionQueue,
      draftsPendingReview,
      suggestedActions,
    };
  } finally {
    db.close();
  }
}

export async function opsCommand(
  options: OpsOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, logger } = context;
  const limit = options.limit ?? 5;
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });

  logger.info('Loading config', { path: configPath });

  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
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

  const reports: OpsReport[] = [];

  if (isMultiMailboxConfig(parsed)) {
    const { config, valid } = await loadMultiMailboxConfig({ path: configPath });
    if (!valid) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: 'Invalid multi-mailbox configuration' },
      };
    }
    for (const mailbox of config.mailboxes) {
      reports.push(await loadOpsReport(mailbox.mailbox_id, resolve(mailbox.root_dir), limit));
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
      reports.push(await loadOpsReport(scope.scope_id, resolve(scope.root_dir), limit));
    }
  }

  // Human output
  if (fmt.getFormat() === 'human') {
    for (const report of reports) {
      fmt.section(`Operator Loop — ${report.scopeId}`);

      fmt.kv('Captured', report.capturedAt);
      fmt.kv('Root Dir', report.rootDir);

      fmt.section('Health');
      fmt.kv('Overall', report.health.overall);
      fmt.kv('Daemon Running', report.health.daemonRunning ?? 'unknown');
      fmt.kv('Sync Fresh', report.health.syncFresh ?? 'unknown');
      fmt.kv('Outbound Healthy', report.health.outboundHealthy ?? 'unknown');
      fmt.kv('Charter Runtime Healthy', report.health.charterRuntimeHealthy ?? 'unknown');

      fmt.section('Recent Activity');
      if (report.recentActivity.evaluations.length > 0) {
        fmt.message('Evaluations:', 'info');
        fmt.table(
          [
            { key: 'id', label: 'ID', width: 20 },
            { key: 'charter', label: 'Charter', width: 16 },
            { key: 'outcome', label: 'Outcome', width: 12 },
            { key: 'time', label: 'Time', width: 20 },
          ],
          report.recentActivity.evaluations.map((e) => ({
            id: e.id.slice(0, 18),
            charter: e.charter_id,
            outcome: e.outcome,
            time: e.analyzed_at,
          })),
        );
      } else {
        fmt.message('No recent evaluations.', 'info');
      }

      if (report.recentActivity.decisions.length > 0) {
        fmt.message('Decisions:', 'info');
        fmt.table(
          [
            { key: 'id', label: 'ID', width: 20 },
            { key: 'action', label: 'Action', width: 14 },
            { key: 'time', label: 'Time', width: 20 },
          ],
          report.recentActivity.decisions.map((d) => ({
            id: d.id.slice(0, 18),
            action: d.approved_action,
            time: d.decided_at,
          })),
        );
      } else {
        fmt.message('No recent decisions.', 'info');
      }

      if (report.recentActivity.executions.length > 0) {
        fmt.message('Executions:', 'info');
        fmt.table(
          [
            { key: 'id', label: 'ID', width: 20 },
            { key: 'status', label: 'Status', width: 12 },
            { key: 'time', label: 'Started', width: 20 },
          ],
          report.recentActivity.executions.map((e) => ({
            id: e.id.slice(0, 18),
            status: e.status,
            time: e.started_at,
          })),
        );
      } else {
        fmt.message('No recent executions.', 'info');
      }

      fmt.section('Attention Queue');
      if (report.attentionQueue.length > 0) {
        fmt.table(
          [
            { key: 'type', label: 'Type', width: 14 },
            { key: 'id', label: 'ID', width: 20 },
            { key: 'description', label: 'Description', width: 36 },
            { key: 'since', label: 'Since', width: 20 },
          ],
          report.attentionQueue.map((a) => ({
            type: a.type,
            id: a.id.slice(0, 18),
            description: a.description.slice(0, 33),
            since: a.since,
          })),
        );
      } else {
        fmt.message('No items need attention.', 'success');
      }

      fmt.section('Drafts Pending Review');
      if (report.draftsPendingReview.length > 0) {
        fmt.table(
          [
            { key: 'outbound_id', label: 'Outbound ID', width: 18 },
            { key: 'action', label: 'Action', width: 12 },
            { key: 'status', label: 'Review Status', width: 14 },
            { key: 'summary', label: 'Summary', width: 24 },
            { key: 'actions', label: 'Available Actions', width: 24 },
          ],
          report.draftsPendingReview.map((d) => ({
            outbound_id: d.outbound_id.slice(0, 16),
            action: d.action_type,
            status: d.review_status,
            summary: (d.payload_summary ?? d.charter_summary ?? '-').slice(0, 22),
            actions: d.available_actions.join(', ').slice(0, 22),
          })),
        );
      } else {
        fmt.message('No drafts pending review.', 'success');
      }

      fmt.section('Suggested Next Actions');
      fmt.list(report.suggestedActions);
    }
    return { exitCode: ExitCode.SUCCESS, result: { status: 'success', reports } };
  }

  // JSON output
  return { exitCode: ExitCode.SUCCESS, result: { status: 'success', reports } };
}
