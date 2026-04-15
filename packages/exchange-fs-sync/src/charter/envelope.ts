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
} from "../foreman/types.js";
import type { CoordinatorStore, NormalizedThreadContext, WorkItem } from "../coordinator/types.js";
import type { NormalizedMessage } from "../types/normalized.js";
import { FileMessageStore } from "../persistence/messages.js";

function safeSegment(value: string): string {
  return encodeURIComponent(value);
}

export interface BuildInvocationEnvelopeDeps {
  coordinatorStore: CoordinatorStore;
  messageStore: FileMessageStore;
  rootDir: string;
}

export interface BuildInvocationEnvelopeOptions {
  executionId: string;
  workItem: WorkItem;
  maxPriorEvaluations?: number;
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

export async function buildInvocationEnvelope(
  deps: BuildInvocationEnvelopeDeps,
  opts: BuildInvocationEnvelopeOptions,
): Promise<CharterInvocationEnvelope> {
  const { coordinatorStore, messageStore, rootDir } = deps;
  const { executionId, workItem, maxPriorEvaluations = 3 } = opts;

  const conversationRecord = coordinatorStore.getConversationRecord(workItem.conversation_id);
  const charterId = conversationRecord?.primary_charter ?? "support_steward";
  const role: "primary" | "secondary" = "primary";

  const messageIds = await getThreadMessageIds(rootDir, workItem.conversation_id);
  const messages: NormalizedMessage[] = [];
  for (const messageId of messageIds) {
    const record = await messageStore.readRecord(messageId);
    if (record && typeof record === "object") {
      messages.push(record as NormalizedMessage);
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
      charter_id: evalRow.charter_id as "support_steward" | "obligation_keeper",
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
    charter_id: charterId as "support_steward" | "obligation_keeper",
    role,
    invoked_at: new Date().toISOString(),
    revision_id: workItem.opened_for_revision_id,
    thread_context: threadContext,
    allowed_actions: ["draft_reply", "send_reply", "mark_read", "no_action"],
    available_tools: [],
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
