# Outbound Draft Worker Spec

## Mission
Define a de-arbitrized outbound execution model for agent-worked Exchange helpdesk mailboxes, using draft-first delivery, durable local state, and deterministic reconciliation.

## Scope
Helpdesk outbound architecture layered on top of the existing inbound mailbox compiler in `packages/exchange-fs-sync/`.

This spec does not require changing the inbound sync invariants. It defines the outbound command model, state machine, identity boundaries, and failure semantics needed for reliable side effects.

## Context
The existing project is a deterministic inbound state compiler from Microsoft Graph mailbox deltas into local filesystem state. For a helpdesk mailbox, that solves ingestion, but not outbound execution.

Outbound actions must not be executed inline by the reasoning agent. They must flow through a dedicated durable command system with draft-based send semantics, retries, policy checks, and post-send reconciliation.

## Canonical Runtime Model

Separate long-running processes:

1. Inbound sync
2. Coordinator or agent
3. Outbound worker
4. Reconciler

Responsibilities:

- Inbound sync materializes mailbox state locally.
- Coordinator or agent decides actions and writes outbound commands.
- Outbound worker is the only process allowed to create, update, and send managed drafts.
- Reconciler binds local outbound state to observed remote mailbox facts after send.

## Decisions Already Made

### Persistence

- Canonical persistence layer: `SQLite`
- SQLite is the source of truth for outbound commands, versions, transitions, and audit history.

### Identity

- Canonical business identity: `outbound_id`
- Graph `draft_id` is a mutable remote handle, not the primary business identity.
- Thread identity uses a deterministic local thread key derived from synced mailbox data.

### Versioning

- A single `outbound_id` may have multiple draft versions.
- Only the latest unsent version is eligible to send.
- Older unsent versions become `superseded`.

### Completion Model

- `submitted`: Graph accepted the send operation
- `confirmed`: inbound sync and reconciliation observed the expected mailbox result

Completion is two-stage. API success alone is insufficient for final confirmation.

### Manual Modification Policy

- Manual modification of a managed draft is not allowed.
- If detected, the command hard-fails permanently.
- Recovery requires a new outbound command.

### Worker Model

- v1 assumes a single outbound worker.
- No lease-stealing or multi-worker arbitration is required in v1.

### Retry Policy

- Retry retryable failures with exponential backoff and bounded attempts.
- After max attempts, transition to `failed_terminal`.

### Draft Reuse

- If a retry occurs after draft creation, reuse the same draft when it still exists and remains unchanged.
- Recreate only if the managed draft is missing or invalid.

### Reconciliation Marker

- Candidate stronger marker: custom Internet header carrying `outbound_id`
- Current canonical reconciliation rule: deterministic tuple matching
- A metadata-based primary marker may only become canonical after Graph-path verification

### Outbound Scope For v1

- `send_reply`
- `send_new_message`
- `mark_read`
- `move_message`
- `set_categories`

All of these use the same durable outbound command pipeline.

### Thread Freshness

- If there is a newer inbound customer message on the same thread after draft preparation but before send, send anyway.

### Approval Model

- Fully autonomous v1
- Agent may enqueue outbound commands without human approval

### Active Command Uniqueness

- At most one active unsent command per `(thread_id, action_type)`
- New intent must supersede or cancel the existing active unsent command

### Audit Retention

- Keep full command payloads, draft snapshots, transitions, and receipts indefinitely until explicit retention is designed

### Draft Creation Timing

- Managed draft is created only when the outbound worker first claims the command for execution

### Policy Failure Behavior

- Policy failures do not become terminal immediately
- Transition to `blocked_policy`
- Continue only via a new version or explicit override

### Attachments

- No outbound attachments in v1

### Recipient Safety

- Replies may only target participants already present on the inbound thread

## Command Schema

Illustrative canonical schema:

```typescript
type OutboundActionType =
  | "send_reply"
  | "send_new_message"
  | "mark_read"
  | "move_message"
  | "set_categories";

interface OutboundCommand {
  outbound_id: string;
  thread_id: string;
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
}

interface OutboundVersion {
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
  created_at: string;
  superseded_at: string | null;
}

interface ManagedDraft {
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
```

Notes:

- `idempotency_key` is version-specific, not just command-specific.
- `body_text` and `body_html` are both stored canonically.
- Non-send actions use the same command envelope but action-specific payload tables or JSON columns.

## State Machine

Canonical states:

- `pending`
- `draft_creating`
- `draft_ready`
- `sending`
- `submitted`
- `confirmed`
- `retry_wait`
- `blocked_policy`
- `failed_terminal`
- `cancelled`
- `superseded`

### Eligibility Rule

A command version is eligible to send only if all are true:

- It is the latest version for its `outbound_id`
- Its command is not `cancelled`, `superseded`, or `failed_terminal`
- It is not externally modified
- It passes current policy checks
- No newer active unsent command exists for the same `(thread_id, action_type)`

### Canonical Transitions

```text
pending -> draft_creating
draft_creating -> draft_ready
draft_creating -> retry_wait
draft_creating -> failed_terminal

draft_ready -> sending
draft_ready -> blocked_policy
draft_ready -> superseded
draft_ready -> cancelled

sending -> submitted
sending -> retry_wait
sending -> failed_terminal

submitted -> confirmed
submitted -> retry_wait

retry_wait -> draft_ready
retry_wait -> draft_creating
retry_wait -> failed_terminal

pending -> blocked_policy
pending -> cancelled
pending -> superseded

blocked_policy -> superseded
blocked_policy -> cancelled
blocked_policy -> pending
```

Rules:

- `submitted` is not terminal.
- `confirmed` is terminal success.
- `failed_terminal`, `cancelled`, and `superseded` are terminal for that version.
- A new version advances the command and supersedes the prior unsent version.

## Invariants

1. The agent never sends directly.
2. Only the outbound worker may create or mutate managed drafts.
3. `outbound_id` remains stable across versions.
4. At most one active unsent command exists per `(thread_id, action_type)`.
5. At most one latest eligible version exists per `outbound_id`.
6. A send may only occur from `draft_ready`.
7. `confirmed` implies prior `submitted`.
8. Manual modification of a managed draft implies hard failure.
9. Reconciliation must run before resend when process state is ambiguous after a crash.
10. Inbound sync never mutates outbound state directly.

## Draft Management Rules

### Draft Creation

The worker creates the Graph draft when it first claims a `pending` command or version.

The worker must stamp the draft with:

- custom Internet header carrying `outbound_id` when supported by the chosen Graph path
- canonical subject
- canonical text and HTML bodies
- canonical recipients

The presence of this header must not be assumed for correctness until verified against the actual Graph draft, send, and retrieval path used by the worker.

### Draft Reuse

On retry:

- reuse existing managed draft if present and unchanged
- recreate if missing
- recreate if invalid for the current version

### External Modification Detection

Any mismatch between expected managed draft state and observed remote draft state counts as external modification unless explicitly caused by the worker.

Detected external modification transitions the command version to `failed_terminal`.

## Reconciliation

### Current Canonical Matching Strategy

Until Graph metadata preservation is verified, reconciliation must use the tuple:

- `reply_to_message_id`
- normalized recipients
- normalized subject
- body hash
- bounded send time window

This tuple matcher is the current normative rule and must be deterministic and documented in code and tests.

### Candidate Metadata Upgrade

If Graph reliably preserves a custom Internet header carrying `outbound_id` across the intended draft, send, and sent-item retrieval path, that marker may later be promoted to the primary reconciliation mechanism.

Until then:

- metadata-based matching is an optimization candidate only
- tuple matching remains canonical

### Crash Recovery Rule

If Graph send succeeded but local SQLite was not updated due to crash:

- do not resend immediately
- first run reconciliation
- only retry send if reconciliation determines the command was not submitted

## Policy Checks

Before send, the worker must validate:

- recipients are already participants on the inbound thread for replies
- no outbound attachments are present in v1
- command is still the latest eligible version
- no local terminal or superseding condition exists

If policy fails:

- transition to `blocked_policy`
- preserve full context and reason
- require a new version or explicit override to proceed

## Non-Send Actions

The following actions share the same durable command model:

- `mark_read`
- `move_message`
- `set_categories`

They still require:

- durable command record
- worker-only execution
- retries for retryable failures
- reconciliation where appropriate
- audit history

## Suggested SQLite Shape

```sql
create table outbound_commands (
  outbound_id text primary key,
  thread_id text not null,
  mailbox_id text not null,
  action_type text not null,
  status text not null,
  latest_version integer not null,
  created_at text not null,
  created_by text not null,
  submitted_at text,
  confirmed_at text,
  blocked_reason text,
  terminal_reason text
);

create table outbound_versions (
  outbound_id text not null,
  version integer not null,
  payload_json text not null,
  body_text text not null,
  body_html text not null,
  idempotency_key text not null,
  created_at text not null,
  superseded_at text,
  primary key (outbound_id, version)
);

create table managed_drafts (
  outbound_id text not null,
  version integer not null,
  draft_id text not null,
  etag text,
  body_hash text not null,
  recipients_hash text not null,
  subject_hash text not null,
  created_at text not null,
  last_verified_at text,
  invalidated_reason text,
  primary key (outbound_id, version)
);

create table outbound_transitions (
  id integer primary key autoincrement,
  outbound_id text not null,
  version integer,
  from_status text,
  to_status text not null,
  reason text,
  transition_at text not null
);
```

## Definition Of Done

- [x] Formal outbound command schema documented
- [x] Formal state machine documented
- [x] Invariants documented
- [x] Draft lifecycle documented
- [x] Reconciliation rules documented
- [x] Policy gating documented
- [x] Non-send action handling documented
- [x] SQLite schema shape proposed
- [x] Crash recovery behavior documented
- [x] Spec accepted as the canonical v1 outbound model

## Open Implementation Notes

- [x] **Verified & implemented:** Graph preserves custom Internet headers (`X-Outbound-Id`) across draft creation, send, and sent-item retrieval. Used as primary reconciliation marker.
- [x] **Implemented:** `send_reply` worker with draft lifecycle, reuse, policy gates, and crash-safe send.
- [x] **Implemented:** Reconciler for `submitted -> confirmed` with timeout fallback to `retry_wait`.
- [x] **Implemented:** Non-send worker for `mark_read`, `move_message`, `set_categories` using the same durable command model.
- [ ] Confirm whether draft `etag` semantics are strong enough for modification detection.
- [ ] Decide whether `send_new_message` should use the same recipient restriction as `send_reply` or a separate policy set.
- [ ] Add explicit override semantics later if `blocked_policy` needs controlled release.
