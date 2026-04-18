/**
 * Mailbox-vertical observability queries.
 *
 * These functions are structurally isolated from generic observability.
 * Generic modules must not depend on them.
 */

import type { CoordinatorStoreView } from "../coordinator/types.js";
import type { OutboundStoreView } from "../outbound/store.js";
import type {
  MailExecutionDetail,
  MailExecutionTransition,
  MailboxConversationSummary,
  MailboxVerticalView,
} from "./mailbox-types.js";
import { getRecentOutboundCommands } from "./queries.js";

export function getMailExecutionDetails(
  outboundStore: OutboundStoreView,
  limit = 50,
): MailExecutionDetail[] {
  const commands = outboundStore.db
    .prepare(`select * from outbound_handoffs order by created_at desc limit ?`)
    .all(limit) as Record<string, unknown>[];

  const transitionsMap = new Map<string, MailExecutionTransition[]>();
  const transitionRows = outboundStore.db
    .prepare(`select * from outbound_transitions order by transition_at desc`)
    .all() as Record<string, unknown>[];

  for (const row of transitionRows) {
    const outboundId = String(row.outbound_id);
    const list = transitionsMap.get(outboundId) ?? [];
    list.push({
      transition_id: Number(row.id),
      from_status: String(row.from_status) as MailExecutionTransition["from_status"],
      to_status: String(row.to_status) as MailExecutionTransition["to_status"],
      reason: row.reason ? String(row.reason) : null,
      created_at: String(row.created_at),
    });
    transitionsMap.set(outboundId, list);
  }

  const versionsMap = new Map<string, Record<string, unknown> | undefined>();
  const versionRows = outboundStore.db
    .prepare(`select * from outbound_versions where superseded_at is null`)
    .all() as Record<string, unknown>[];
  for (const row of versionRows) {
    versionsMap.set(String(row.outbound_id), row);
  }

  return commands.map((row) => {
    const outboundId = String(row.outbound_id);
    const version = versionsMap.get(outboundId);

    return {
      outbound_id: outboundId,
      intent_id: "", // Will be resolved by caller if needed; kept intentionally shallow here
      context_id: String(row.context_id),
      scope_id: String(row.scope_id),
      action_type: String(row.action_type),
      status: String(row.status) as MailExecutionDetail["status"],
      latest_version: Number(row.latest_version ?? 1),
      idempotency_key: String(row.idempotency_key),
      submitted_at: row.submitted_at ? String(row.submitted_at) : null,
      confirmed_at: row.confirmed_at ? String(row.confirmed_at) : null,
      blocked_reason: row.blocked_reason ? String(row.blocked_reason) : null,
      terminal_reason: row.terminal_reason ? String(row.terminal_reason) : null,
      created_at: String(row.created_at),
      transitions: transitionsMap.get(outboundId) ?? [],
      latest_version_detail: version
        ? {
            to: JSON.parse(String(version.to_json ?? "[]")) as string[],
            cc: JSON.parse(String(version.cc_json ?? "[]")) as string[],
            bcc: JSON.parse(String(version.bcc_json ?? "[]")) as string[],
            subject: String(version.subject ?? ""),
            body_text_preview: String(version.body_text ?? "").slice(0, 500),
          }
        : null,
    };
  });
}

export function getMailboxVerticalView(
  coordinatorStore: Pick<CoordinatorStoreView, "db">,
  outboundStore: OutboundStoreView,
  scopeId: string,
): MailboxVerticalView {
  const conversationRows = coordinatorStore.db
    .prepare(
      `select context_id as conversation_id, scope_id as mailbox_id, status, primary_charter, assigned_agent,
              last_message_at, last_inbound_at, last_outbound_at, created_at, updated_at
       from context_records
       where scope_id = ?
         and context_id not like 'timer:%'
         and context_id not like 'webhook:%'
         and context_id not like 'fs:%'
         and context_id not like 'filesystem:%'
       order by updated_at desc
       limit 100`,
    )
    .all(scopeId) as Record<string, unknown>[];

  const conversations: MailboxConversationSummary[] = conversationRows.map((row) => ({
    context_id: String(row.conversation_id),
    scope_id: String(row.mailbox_id),
    status: String(row.status),
    primary_charter: String(row.primary_charter),
    assigned_agent: row.assigned_agent ? String(row.assigned_agent) : null,
    last_message_at: row.last_message_at ? String(row.last_message_at) : null,
    last_inbound_at: row.last_inbound_at ? String(row.last_inbound_at) : null,
    last_outbound_at: row.last_outbound_at ? String(row.last_outbound_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));

  const outbound = getRecentOutboundCommands(outboundStore, 50).filter(
    (o) => o.scope_id === scopeId,
  );

  const evaluationRows = coordinatorStore.db
    .prepare(
      `select evaluation_id as output_id, context_id, scope_id, charter_id, summary, analyzed_at
       from evaluations
       where scope_id = ?
       order by analyzed_at desc
       limit 50`,
    )
    .all(scopeId) as Array<{
      output_id: string;
      context_id: string;
      scope_id: string;
      charter_id: string;
      summary: string;
      analyzed_at: string;
    }>;

  return {
    scope_id: scopeId,
    conversations,
    outbound,
    outputs: evaluationRows.map((row) => ({
      output_id: row.output_id,
      context_id: row.context_id,
      charter_id: row.charter_id,
      summary: row.summary,
      analyzed_at: row.analyzed_at,
    })),
  };
}
