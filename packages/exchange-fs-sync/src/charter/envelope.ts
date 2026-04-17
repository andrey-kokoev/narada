/**
 * Charter Envelope Builders
 *
 * Helpers to construct invocation envelopes and evaluation records.
 */

import type {
  CharterInvocationEnvelope,
  CharterOutputEnvelope,
  EvaluationEnvelope,
  ToolCatalogEntry,
} from "../foreman/types.js";
import type { PolicyContext } from "../foreman/context.js";
import type { CoordinatorStore, WorkItem } from "../coordinator/types.js";
import type { RuntimePolicy } from "../config/types.js";
import { MailboxContextMaterializer } from "./mailbox/materializer.js";

export interface BuildInvocationEnvelopeDeps {
  coordinatorStore: CoordinatorStore;
  rootDir: string;
  getRuntimePolicy: (scopeId: string) => RuntimePolicy;
  /** Optional message store, required only when using the mail materializer fallback. */
  messageStore?: import("../persistence/messages.js").FileMessageStore;
}

export interface BuildInvocationEnvelopeOptions {
  executionId: string;
  workItem: WorkItem;
  maxPriorEvaluations?: number;
  tools?: ToolCatalogEntry[];
  materializer?: ContextMaterializer;
}

export interface ContextMaterializer {
  materialize(context: PolicyContext): Promise<unknown>;
}

/**
 * Timer-specific context materializer.
 *
 * Extracts schedule metadata from timer facts.
 */
export class TimerContextMaterializer implements ContextMaterializer {
  async materialize(context: PolicyContext): Promise<unknown> {
    const tickFact = context.facts.find((f) => f.fact_type === "timer.tick");
    let scheduleId: string | undefined;
    let metadata: unknown = {};
    if (tickFact) {
      try {
        const payload = JSON.parse(tickFact.payload_json) as Record<string, unknown>;
        const event = payload.event as Record<string, unknown> | undefined;
        if (event && typeof event === "object") {
          scheduleId = typeof event.schedule_id === "string" ? event.schedule_id : undefined;
          metadata = event.metadata ?? {};
        }
      } catch {
        // ignore parse errors
      }
    }
    return {
      schedule_id: scheduleId ?? context.context_id.replace(/^timer:/, ""),
      tick_at: context.synced_at,
      metadata,
      facts: context.facts,
    };
  }
}

/**
 * Webhook-specific context materializer.
 *
 * Extracts endpoint payload from webhook facts.
 */
export class WebhookContextMaterializer implements ContextMaterializer {
  async materialize(context: PolicyContext): Promise<unknown> {
    const webhookFact = context.facts.find((f) => f.fact_type === "webhook.received");
    let endpointId: string | undefined;
    let payload: unknown = {};
    if (webhookFact) {
      try {
        const parsed = JSON.parse(webhookFact.payload_json) as Record<string, unknown>;
        const event = parsed.event as Record<string, unknown> | undefined;
        if (event && typeof event === "object") {
          endpointId = typeof event.endpoint_id === "string" ? event.endpoint_id : undefined;
          payload = event.payload ?? {};
        }
      } catch {
        // ignore parse errors
      }
    }
    return {
      endpoint_id: endpointId ?? context.context_id.replace(/^webhook:/, ""),
      received_at: context.synced_at,
      payload,
      facts: context.facts,
    };
  }
}

/**
 * Filesystem-specific context materializer.
 *
 * Extracts file change metadata from filesystem facts.
 */
export class FilesystemContextMaterializer implements ContextMaterializer {
  async materialize(context: PolicyContext): Promise<unknown> {
    const fsFact = context.facts.find((f) => f.fact_type === "filesystem.change");
    let watchId: string | undefined;
    let path: string | undefined;
    let changeType: string | undefined;
    let size: number | undefined;
    if (fsFact) {
      try {
        const parsed = JSON.parse(fsFact.payload_json) as Record<string, unknown>;
        const event = parsed.event as Record<string, unknown> | undefined;
        if (event && typeof event === "object") {
          watchId = typeof event.watch_id === "string" ? event.watch_id : undefined;
          path = typeof event.path === "string" ? event.path : undefined;
          changeType = typeof event.change_type === "string" ? event.change_type : undefined;
          size = typeof event.size === "number" ? event.size : undefined;
        }
      } catch {
        // ignore parse errors
      }
    }
    return {
      watch_id: watchId ?? context.context_id.replace(/^fs:/, ""),
      path: path ?? "",
      change_type: changeType ?? "modified",
      size,
      changed_at: context.synced_at,
      facts: context.facts,
    };
  }
}

// CLASSIFICATION: historical residue with acceptable fallback — the prefix-based
// dispatch is neutral, but falling back to MailboxContextMaterializer encodes a
// mail-default assumption. Future cleanup should use an explicit materializer
// registry (e.g., Map<vertical, ContextMaterializer>) injected by the caller.
function selectMaterializer(
  context: PolicyContext,
  deps: BuildInvocationEnvelopeDeps,
): ContextMaterializer {
  if (context.context_id.startsWith("timer:")) {
    return new TimerContextMaterializer();
  }
  if (context.context_id.startsWith("webhook:")) {
    return new WebhookContextMaterializer();
  }
  if (context.context_id.startsWith("fs:")) {
    return new FilesystemContextMaterializer();
  }
  if (!deps.messageStore) {
    throw new Error("messageStore is required for mailbox context materialization");
  }
  return new MailboxContextMaterializer(deps.rootDir, deps.messageStore);
}

// CLASSIFICATION: kernel-generic with mail-default residue — the function is
// vertically neutral, but the "mail" fallback is a vestige of mailbox-as-default.
// It is harmless as a runtime hint, yet should become explicit once vertical
// registration is introduced.
function resolveVertical(context: PolicyContext): string {
  if (context.context_id.startsWith("timer:")) return "timer";
  if (context.context_id.startsWith("webhook:")) return "webhook";
  if (context.context_id.startsWith("fs:")) return "filesystem";
  return "mail";
}

function buildPolicyContextFromWorkItem(workItem: WorkItem): PolicyContext {
  return {
    context_id: workItem.context_id,
    scope_id: workItem.scope_id,
    revision_id: workItem.opened_for_revision_id,
    previous_revision_ordinal: null,
    current_revision_ordinal: 0,
    change_kinds: [],
    facts: [],
    synced_at: workItem.created_at,
  };
}

export async function buildInvocationEnvelope(
  deps: BuildInvocationEnvelopeDeps,
  opts: BuildInvocationEnvelopeOptions,
): Promise<CharterInvocationEnvelope> {
  const { workItem, maxPriorEvaluations = 3, tools } = opts;

  const contextRecord = deps.coordinatorStore.getContextRecord(workItem.context_id);
  if (!contextRecord) {
    throw new Error(
      `Cannot build invocation envelope: no context record found for ${workItem.context_id}`,
    );
  }
  const charterId = contextRecord.primary_charter;
  const role: "primary" | "secondary" = "primary";
  const policy = deps.getRuntimePolicy(workItem.scope_id);

  let policyContext: PolicyContext;
  if (workItem.context_json) {
    policyContext = JSON.parse(workItem.context_json) as PolicyContext;
  } else {
    policyContext = buildPolicyContextFromWorkItem(workItem);
  }

  const materializer = opts.materializer ?? selectMaterializer(policyContext, deps);
  const contextMaterialization = await materializer.materialize(policyContext);

  const priorEvaluations = deps.coordinatorStore
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
    execution_id: opts.executionId,
    work_item_id: workItem.work_item_id,
    context_id: workItem.context_id,
    scope_id: workItem.scope_id,
    charter_id: charterId,
    role,
    invoked_at: new Date().toISOString(),
    revision_id: workItem.opened_for_revision_id,
    context_materialization: contextMaterialization,
    vertical_hints: { vertical: resolveVertical(policyContext) },
    allowed_actions: policy.allowed_actions,
    available_tools: tools ?? [],
    coordinator_flags: [],
    prior_evaluations: priorEvaluations,
    max_prior_evaluations: maxPriorEvaluations,
  };
}

export interface BuildEvaluationRecordOptions {
  output: CharterOutputEnvelope;
  attempt: { execution_id: string; work_item_id: string; context_id: string };
}

export function buildEvaluationRecord(
  output: CharterOutputEnvelope,
  attempt: { execution_id: string; work_item_id: string; context_id: string },
): EvaluationEnvelope {
  return {
    evaluation_id: `ev_${attempt.execution_id}`,
    execution_id: attempt.execution_id,
    work_item_id: attempt.work_item_id,
    context_id: attempt.context_id,
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
