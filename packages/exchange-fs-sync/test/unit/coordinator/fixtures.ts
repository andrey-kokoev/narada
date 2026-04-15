import type {
  ThreadRecord,
  ConversationRecord,
  CharterOutputRow,
  ForemanDecisionRow,
  PolicyOverrideRow,
} from "../../../src/coordinator/types.js";

export function createThreadRecord(overrides?: Partial<ThreadRecord>): ThreadRecord {
  const now = new Date().toISOString();
  return {
    thread_id: "thread-1",
    mailbox_id: "mailbox-1",
    primary_charter: "support_steward",
    secondary_charters_json: "[]",
    status: "active",
    assigned_agent: null,
    last_message_at: now,
    last_inbound_at: null,
    last_outbound_at: null,
    last_analyzed_at: null,
    last_triaged_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createConversationRecord(overrides?: Partial<ConversationRecord>): ConversationRecord {
  const now = new Date().toISOString();
  return {
    conversation_id: "conv-1",
    mailbox_id: "mailbox-1",
    primary_charter: "support_steward",
    secondary_charters_json: "[]",
    status: "active",
    assigned_agent: null,
    last_message_at: now,
    last_inbound_at: null,
    last_outbound_at: null,
    last_analyzed_at: null,
    last_triaged_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createCharterOutput(overrides?: Partial<CharterOutputRow>): CharterOutputRow {
  const now = new Date().toISOString();
  return {
    output_id: "output-1",
    thread_id: "thread-1",
    mailbox_id: "mailbox-1",
    charter_id: "support_steward",
    role: "primary",
    output_version: "1.0.0",
    analyzed_at: now,
    summary: "Test summary",
    classifications_json: "[]",
    facts_json: "[]",
    escalations_json: "[]",
    proposed_actions_json: "[]",
    tool_requests_json: "[]",
    created_at: now,
    ...overrides,
  };
}

export function createForemanDecision(overrides?: Partial<ForemanDecisionRow>): ForemanDecisionRow {
  const now = new Date().toISOString();
  return {
    decision_id: "decision-1",
    thread_id: "thread-1",
    mailbox_id: "mailbox-1",
    source_charter_ids_json: '["support_steward"]',
    approved_action: "send_reply",
    payload_json: "{}",
    rationale: "Test rationale",
    decided_at: now,
    outbound_id: null,
    created_by: "foreman:fm-001/charter:support_steward",
    ...overrides,
  };
}

export function createPolicyOverride(overrides?: Partial<PolicyOverrideRow>): PolicyOverrideRow {
  const now = new Date().toISOString();
  return {
    override_id: "override-1",
    outbound_id: "outbound-1",
    overridden_by: "user-1",
    reason: "Override reason",
    created_at: now,
    ...overrides,
  };
}
