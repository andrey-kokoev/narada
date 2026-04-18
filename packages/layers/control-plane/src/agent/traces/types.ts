/**
 * Agent Trace Persistence Types
 *
 * Append-only durable commentary for agent reasoning, decisions, and observations.
 *
 * Semantics:
 * - Traces are commentary, not authority. No control-plane correctness depends on them.
 * - `execution_id` is the canonical anchor (primary attachment point).
 * - All other references (`context_id`, `work_item_id`, `session_id`, `reference_outbound_id`)
 *   are navigational only and non-authoritative.
 *
 * Spec: .ai/tasks/20260415-027-trace-system-reanchored-on-canonical-identity.md
 */

export type TraceType =
  | "observation"
  | "decision"
  | "action"
  | "handoff"
  | "tool_call"
  | "runtime_output"
  | "debug";

/**
 * A single trace record.
 *
 * Identity model:
 * - `execution_id` is the canonical anchor (required, non-null).
 * - `context_id` is required for context-level navigation.
 * - `work_item_id` is optional local navigation.
 * - `session_id` is optional single-execution correlation.
 * - `reference_outbound_id` and `reference_message_id` are logical references only
 *   (no FK constraints) so trace retention is not coupled to command retention.
 */
export interface AgentTrace {
  trace_id: string;
  execution_id: string;
  context_id: string;
  work_item_id: string | null;
  session_id: string | null;
  trace_type: TraceType;
  reference_outbound_id: string | null;
  reference_message_id: string | null;
  payload_json: string;
  created_at: string;
}

export interface AgentTraceStore {
  initSchema(): void;

  writeTrace(
    trace: Omit<AgentTrace, "trace_id" | "created_at">,
  ): AgentTrace;

  /** Canonical read by execution_id (primary anchor). */
  readByExecutionId(executionId: string): AgentTrace[];

  readByContextId(
    contextId: string,
    opts?: {
      after?: string;
      before?: string;
      limit?: number;
      types?: TraceType[];
    },
  ): AgentTrace[];

  readBySession(sessionId: string): AgentTrace[];

  readByOutboundId(outboundId: string): AgentTrace[];

  getTrace(traceId: string): AgentTrace | undefined;

  close(): void;
}
