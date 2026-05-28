import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  Database,
  loadConfig,
  isMultiMailboxConfig,
  loadMultiMailboxConfig,
  OutboundHandoff,
  SqliteCoordinatorStore,
  SqliteIntentStore,
  SqliteOutboundStore,
  type ForemanDecisionRow,
} from '@narada2/control-plane';

export interface ApprovePendingDecisionOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  decisionId: string;
  by?: string;
}

interface ScopeDbTarget {
  scopeId: string;
  rootDir: string;
}

interface PendingDecisionPayload {
  reason?: string;
  proposed_action?: {
    action_type?: string;
    payload_json?: string;
    rationale?: string;
  } | null;
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createdByForOperatorApproval(by: string): string {
  const safe = by.replace(/[^A-Za-z0-9_.:-]/g, '_');
  return `foreman:operator-${safe}/charter:pending-approval`;
}

async function resolveScopeTargets(configPath: string): Promise<ScopeDbTarget[] | Error> {
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (error) {
    return new Error('Failed to read config: ' + (error as Error).message);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return new Error('Failed to parse config: ' + (error as Error).message);
  }

  if (isMultiMailboxConfig(parsed)) {
    const { config, valid } = await loadMultiMailboxConfig({ path: configPath });
    if (!valid) return new Error('Invalid multi-mailbox configuration');
    return config.mailboxes.map((mailbox) => ({
      scopeId: mailbox.mailbox_id,
      rootDir: resolve(mailbox.root_dir),
    }));
  }

  const config = await loadConfig({ path: configPath });
  return config.scopes.map((scope) => ({
    scopeId: scope.scope_id,
    rootDir: resolve(scope.root_dir),
  }));
}

function parsePendingPayload(decision: ForemanDecisionRow): PendingDecisionPayload | Error {
  try {
    return JSON.parse(decision.payload_json) as PendingDecisionPayload;
  } catch {
    return new Error(`Pending decision ${decision.decision_id} has invalid payload_json`);
  }
}

function buildApprovedDecision(
  pending: ForemanDecisionRow,
  payload: PendingDecisionPayload,
  by: string,
): ForemanDecisionRow | Error {
  if (pending.approved_action !== 'pending_approval') {
    return new Error(`Decision ${pending.decision_id} is not pending_approval`);
  }
  if (pending.outbound_id) {
    return new Error(`Decision ${pending.decision_id} is already linked to outbound command ${pending.outbound_id}`);
  }

  const proposed = payload.proposed_action;
  const actionType = cleanString(proposed?.action_type);
  const actionPayload = cleanString(proposed?.payload_json);
  if (!actionType || !actionPayload) {
    return new Error(`Decision ${pending.decision_id} does not contain a materializable proposed_action`);
  }
  if (actionType !== 'draft_reply' && actionType !== 'send_reply') {
    return new Error(`Decision ${pending.decision_id} proposed action ${actionType} is not materializable by this operator`);
  }

  return {
    decision_id: `${pending.decision_id}_approved_${actionType}`,
    context_id: pending.context_id,
    scope_id: pending.scope_id,
    source_charter_ids_json: pending.source_charter_ids_json,
    approved_action: actionType,
    payload_json: actionPayload,
    rationale: cleanString(proposed?.rationale) ?? pending.rationale,
    decided_at: new Date().toISOString(),
    outbound_id: null,
    created_by: createdByForOperatorApproval(by),
  };
}

export async function approvePendingDecisionCommand(
  options: ApprovePendingDecisionOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format, verbose: context.verbose });
  const decisionId = cleanString(options.decisionId);
  const by = cleanString(options.by);
  if (!decisionId) return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: 'decision id is required' } };
  if (!by) return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: '--by is required' } };

  const targets = await resolveScopeTargets(context.configPath);
  if (targets instanceof Error) {
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: targets.message } };
  }
  if (targets.length === 0) {
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: 'No operations configured' } };
  }

  for (const target of targets) {
    const dbPath = join(target.rootDir, '.narada', 'coordinator.db');
    let db: InstanceType<typeof Database> | null = null;
    try {
      db = new Database(dbPath);
      const coordinatorStore = new SqliteCoordinatorStore({ db });
      const outboundStore = new SqliteOutboundStore({ db });
      new SqliteIntentStore({ db }).initSchema();

      const pending = coordinatorStore.getDecisionById(decisionId);
      if (!pending) continue;

      const pendingPayload = parsePendingPayload(pending);
      if (pendingPayload instanceof Error) {
        return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: pendingPayload.message } };
      }
      const approvedDecision = buildApprovedDecision(pending, pendingPayload, by);
      if (approvedDecision instanceof Error) {
        return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: approvedDecision.message } };
      }

      const existingApproved = coordinatorStore.getDecisionById(approvedDecision.decision_id);
      if (existingApproved?.outbound_id) {
        fmt.message(`Pending decision already materialized: ${existingApproved.outbound_id}`, 'info');
        return {
          exitCode: ExitCode.SUCCESS,
          result: {
            status: 'success',
            idempotent: true,
            decision_id: decisionId,
            approved_decision_id: existingApproved.decision_id,
            outbound_id: existingApproved.outbound_id,
            action: existingApproved.approved_action,
          },
        };
      }

      const handoff = new OutboundHandoff({ coordinatorStore, outboundStore });
      const outboundId = db.transaction(() => {
        if (!existingApproved) {
          coordinatorStore.insertDecision(approvedDecision);
        }
        return handoff.createCommandFromDecision(approvedDecision);
      })();

      fmt.message(`Materialized pending decision ${decisionId} as outbound command ${outboundId}`, 'success');
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          idempotent: false,
          decision_id: decisionId,
          approved_decision_id: approvedDecision.decision_id,
          outbound_id: outboundId,
          action: approvedDecision.approved_action,
          next_steps: approvedDecision.approved_action === 'draft_reply'
            ? ['Run the outbound draft worker to create the managed draft; this command does not send mail.']
            : ['Review the outbound command before any send execution path.'],
        },
      };
    } catch (error) {
      return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: (error as Error).message } };
    } finally {
      db?.close();
    }
  }

  return {
    exitCode: ExitCode.GENERAL_ERROR,
    result: { status: 'error', error: `Pending decision ${decisionId} not found in any configured operation` },
  };
}
