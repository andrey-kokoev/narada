/**
 * Agent Trace Persistence Types
 *
 * Append-only durable commentary for agent reasoning, decisions, and observations.
 *
 * Spec: .ai/tasks/20260413-009-agent-trace-persistence.md
 * Review: .ai/reviews/20260413-010-review-agent-trace-architecture.md
 * Identity Closure: .ai/tasks/20260413-010-identify-closure-conversation-chat-session-model.md
 */

export type TraceType =
  | "reasoning"
  | "decision"
  | "action"
  | "observation"
  | "handoff"
  | "override";

/**
 * A single trace record.
 *
 * `rowid` is exposed as a stable local ordering primitive for deterministic
 * replay and cursor-based pagination.
 *
 * Identity model:
 * - `conversation_id` is the canonical mailbox identity (Exchange conversationId).
 * - `chat_id` is an optional local UI/CLI interaction container.
 * - `session_id` is an optional single-execution correlation token.
 */
export interface AgentTrace {
  rowid: number;
  trace_id: string;
  conversation_id: string;
  mailbox_id: string;
  agent_id: string;
  chat_id: string | null;
  session_id: string | null;
  trace_type: TraceType;
  parent_trace_id: string | null;
  reference_outbound_id: string | null;
  reference_message_id: string | null;
  payload_json: string;
  created_at: string;
}

export interface AgentTraceStore {
  initSchema(): void;

  writeTrace(
    trace: Omit<AgentTrace, "rowid" | "trace_id" | "created_at">,
  ): AgentTrace;

  readByConversation(
    conversationId: string,
    opts?: {
      after?: string;
      before?: string;
      limit?: number;
      types?: TraceType[];
    },
  ): AgentTrace[];

  readByChatId(chatId: string): AgentTrace[];

  readBySession(sessionId: string): AgentTrace[];

  readByOutboundId(outboundId: string): AgentTrace[];

  readUnlinkedDecisions(opts?: {
    types?: TraceType[];
    limit?: number;
  }): AgentTrace[];

  getTrace(traceId: string): AgentTrace | undefined;

  close(): void;
}
