/**
 * Charter Envelope Builders
 *
 * Helpers to construct invocation envelopes and evaluation records.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  CharterInvocationEnvelope,
  CharterOutputEnvelope,
  EvaluationEnvelope,
  ToolCatalogEntry,
} from "../foreman/types.js";
import type { CoordinatorStore, NormalizedThreadContext, WorkItem } from "../coordinator/types.js";
import type { NormalizedMessage } from "../types/normalized.js";
import { FileMessageStore } from "../persistence/messages.js";
import type { RuntimePolicy } from "../config/types.js";

function safeSegment(value: string): string {
  return encodeURIComponent(value);
}

export interface BuildInvocationEnvelopeDeps {
  coordinatorStore: CoordinatorStore;
  messageStore: FileMessageStore;
  rootDir: string;
  getRuntimePolicy: (mailboxId: string) => RuntimePolicy;
}

export interface BuildInvocationEnvelopeOptions {
  executionId: string;
  workItem: WorkItem;
  maxPriorEvaluations?: number;
  tools?: ToolCatalogEntry[];
}

async function getThreadMessageIds(rootDir: string, conversationId: string): Promise<string[]> {
  const membersDir = join(rootDir, "views", "by-thread", safeSegment(conversationId), "members");
  try {
    const entries = await readdir(membersDir);
    return entries.map((e) => decodeURIComponent(e));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * Canonical projection from exchange-fs-sync message model into charter runtime model.
 *
 * This is the normative boundary between the compiler's filesystem state and the
 * charter runtime envelope. Any field mapping or default-value injection must be
 * explicit and stable.
 */
export function normalizeMessageForEnvelope(msg: NormalizedMessage): NormalizedMessage {
  const r = msg as unknown as Record<string, unknown>;
  const bodyText =
    typeof msg.body === "object" && msg.body && "text" in msg.body
      ? (msg.body as { text?: string }).text?.slice(0, 200) ?? null
      : null;
  const mapAddr = (a: { email?: string; display_name?: string }): { email: string | null; name: string | null } => ({
    email: a.email ?? null,
    name: a.display_name ?? null,
  });
  return {
    ...msg,
    internet_message_id: (r.internet_message_id as string | undefined) ?? null,
    body_preview: (r.body_preview as string | undefined) ?? bodyText,
    from: Array.isArray(msg.from) ? msg.from.map(mapAddr) : msg.from ? [mapAddr(msg.from)] : [],
    to: (msg.to ?? []).map(mapAddr),
    cc: (msg.cc ?? []).map(mapAddr),
    bcc: (msg.bcc ?? []).map(mapAddr),
    sent_at: (r.sent_at as string | undefined) ?? null,
    is_draft: msg.flags?.is_draft ?? false,
    is_read: msg.flags?.is_read ?? false,
    categories: msg.category_refs ?? [],
    parent_folder_id: (r.parent_folder_id as string | undefined) ?? null,
    importance: (r.importance as "low" | "normal" | "high" | undefined) ?? null,
  } as NormalizedMessage;
}

export async function buildInvocationEnvelope(
  deps: BuildInvocationEnvelopeDeps,
  opts: BuildInvocationEnvelopeOptions,
): Promise<CharterInvocationEnvelope> {
  const { coordinatorStore, messageStore, rootDir } = deps;
  const { executionId, workItem, maxPriorEvaluations = 3, tools } = opts;

  const conversationRecord = coordinatorStore.getConversationRecord(workItem.conversation_id);
  if (!conversationRecord) {
    throw new Error(
      `Cannot build invocation envelope: no conversation record found for ${workItem.conversation_id}`,
    );
  }
  const charterId = conversationRecord.primary_charter;
  const role: "primary" | "secondary" = "primary";
  const policy = deps.getRuntimePolicy(workItem.mailbox_id);

  const messageIds = await getThreadMessageIds(rootDir, workItem.conversation_id);
  const messages: NormalizedMessage[] = [];
  for (const messageId of messageIds) {
    const record = await messageStore.readRecord(messageId);
    if (record && typeof record === "object") {
      messages.push(normalizeMessageForEnvelope(record as NormalizedMessage));
    }
  }

  messages.sort((a, b) => {
    const ta = a.received_at ?? "";
    const tb = b.received_at ?? "";
    return ta.localeCompare(tb);
  });

  const threadContext: NormalizedThreadContext = {
    conversation_id: workItem.conversation_id,
    mailbox_id: workItem.mailbox_id,
    revision_id: workItem.opened_for_revision_id,
    messages,
  };

  const priorEvaluations = coordinatorStore
    .getEvaluationsByWorkItem(workItem.work_item_id)
    .slice(0, maxPriorEvaluations)
    .map((evalRow) => ({
      evaluation_id: evalRow.evaluation_id,
      charter_id: evalRow.charter_id,
      role: evalRow.role as "primary" | "secondary",
      evaluated_at: evalRow.created_at,
      summary: evalRow.summary,
      key_classifications: JSON.parse(evalRow.classifications_json ?? "[]") as {
        kind: string;
        confidence: "low" | "medium" | "high";
      }[],
    }));

  return {
    invocation_version: "2.0",
    execution_id: executionId,
    work_item_id: workItem.work_item_id,
    conversation_id: workItem.conversation_id,
    mailbox_id: workItem.mailbox_id,
    charter_id: charterId,
    role,
    invoked_at: new Date().toISOString(),
    revision_id: workItem.opened_for_revision_id,
    thread_context: threadContext,
    allowed_actions: policy.allowed_actions,
    available_tools: tools ?? [],
    coordinator_flags: [],
    prior_evaluations: priorEvaluations,
    max_prior_evaluations: maxPriorEvaluations,
  };
}

export interface BuildEvaluationRecordOptions {
  output: CharterOutputEnvelope;
  attempt: { execution_id: string; work_item_id: string; conversation_id: string };
}

export function buildEvaluationRecord(
  output: CharterOutputEnvelope,
  attempt: { execution_id: string; work_item_id: string; conversation_id: string },
): EvaluationEnvelope {
  return {
    evaluation_id: `ev_${attempt.execution_id}`,
    execution_id: attempt.execution_id,
    work_item_id: attempt.work_item_id,
    conversation_id: attempt.conversation_id,
    charter_id: output.charter_id,
    role: output.role,
    output_version: output.output_version,
    analyzed_at: output.analyzed_at,
    outcome: output.outcome,
    confidence: output.confidence,
    summary: output.summary,
    classifications: output.classifications,
    facts: output.facts,
    recommended_action_class: output.recommended_action_class,
    proposed_actions: output.proposed_actions,
    tool_requests: output.tool_requests,
    escalations: output.escalations,
  };
}
