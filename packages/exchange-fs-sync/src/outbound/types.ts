/**
 * Outbound Draft Worker Types
 *
 * Canonical command model, state machine, and persistence types for
 * durable outbound execution on top of exchange-fs-sync.
 *
 * Spec: .ai/tasks/20260413-001-outbound-draft-worker-spec.md
 */

export type OutboundActionType =
  | "draft_reply"
  | "send_reply"
  | "send_new_message"
  | "mark_read"
  | "move_message"
  | "set_categories";

export type OutboundStatus =
  | "pending"
  | "draft_creating"
  | "draft_ready"
  | "sending"
  | "submitted"
  | "confirmed"
  | "retry_wait"
  | "blocked_policy"
  | "failed_terminal"
  | "cancelled"
  | "superseded";

/** Canonical outbound command */
export interface OutboundCommand {
  outbound_id: string;
  conversation_id: string;
  mailbox_id: string;
  action_type: OutboundActionType;
  status: OutboundStatus;
  latest_version: number;
  created_at: string;
  created_by: string;
  submitted_at: string | null;
  confirmed_at: string | null;
  blocked_reason: string | null;
  terminal_reason: string | null;
  idempotency_key: string;
}

/** Version-specific payload for an outbound command */
export interface OutboundVersion {
  outbound_id: string;
  version: number;
  reply_to_message_id: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body_text: string;
  body_html: string;
  idempotency_key: string;
  policy_snapshot_json: string;
  payload_json: string;
  created_at: string;
  superseded_at: string | null;
}

/** Graph-managed draft bound to a command version */
export interface ManagedDraft {
  outbound_id: string;
  version: number;
  draft_id: string;
  etag: string | null;
  internet_message_id: string | null;
  header_outbound_id_present: boolean;
  body_hash: string;
  recipients_hash: string;
  subject_hash: string;
  created_at: string;
  last_verified_at: string | null;
  invalidated_reason: string | null;
}

/** Audit log of status transitions */
export interface OutboundTransition {
  id: number;
  outbound_id: string;
  version: number | null;
  from_status: OutboundStatus | null;
  to_status: OutboundStatus;
  reason: string | null;
  transition_at: string;
}

/** Valid state transitions from the spec */
export const VALID_TRANSITIONS: Readonly<
  Record<OutboundStatus, readonly OutboundStatus[]>
> = {
  pending: ["draft_creating", "draft_ready", "blocked_policy", "failed_terminal", "cancelled", "superseded"],
  draft_creating: ["draft_ready", "retry_wait", "failed_terminal"],
  draft_ready: ["sending", "confirmed", "blocked_policy", "superseded", "cancelled"],
  sending: ["submitted", "retry_wait", "failed_terminal"],
  submitted: ["confirmed", "retry_wait"],
  retry_wait: ["draft_ready", "draft_creating", "failed_terminal"],
  blocked_policy: ["superseded", "cancelled", "pending"],
  confirmed: [],
  failed_terminal: [],
  cancelled: [],
  superseded: [],
};

/**
 * Check whether a transition is valid according to the canonical state machine.
 */
export function isValidTransition(
  from: OutboundStatus,
  to: OutboundStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Terminal states where no further transitions are allowed.
 */
export const TERMINAL_STATUSES: readonly OutboundStatus[] = [
  "confirmed",
  "failed_terminal",
  "cancelled",
  "superseded",
];

export function isTerminalStatus(status: OutboundStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Determine whether a version is eligible to send.
 * Eligibility rules from the spec:
 * - It must be the latest version for its outbound_id
 * - Its command must not be terminal, cancelled, or superseded
 * - The version itself must not be superseded
 */
export function isVersionEligible(
  version: OutboundVersion,
  command: OutboundCommand,
): boolean {
  if (version.outbound_id !== command.outbound_id) return false;
  if (command.latest_version !== version.version) return false;
  if (version.superseded_at !== null) return false;
  // Eligibility requires draft_ready status for any draft-based action
  if (command.status !== "draft_ready") return false;
  return true;
}

/**
 * Supersede all prior unsent versions when a new version is created.
 */
export function supersedePriorVersions(
  versions: OutboundVersion[],
  newVersionNumber: number,
): OutboundVersion[] {
  const now = new Date().toISOString();
  return versions.map((v) => {
    if (v.version < newVersionNumber && v.superseded_at === null) {
      return { ...v, superseded_at: now };
    }
    return v;
  });
}

/**
 * Assert that at most one version is eligible to send for a given outbound_id.
 * Throws if the invariant is violated.
 */
export function assertSingleLatestEligible(
  outboundId: string,
  versions: OutboundVersion[],
  command: OutboundCommand,
): void {
  const eligible = versions.filter(
    (v) => v.outbound_id === outboundId && isVersionEligible(v, command),
  );
  if (eligible.length > 1) {
    throw new Error(
      `Invariant violation: ${eligible.length} eligible versions for ${outboundId}`,
    );
  }
}
