# Foreman And Charters Architecture

> **Cross-reference:** Coordinator SQLite schema, foreman → outbound handoff, and unified
> `CoordinatorConfig` are resolved in
> `.ai/tasks/20260413-012-coordinator-state-and-foreman-handoff.md`.

## Mission
Define the concrete coordinator-first contract for agents working on mailboxes, with one foreman authority above selective charter invocation.

This document is the canonical control-plane spec for mailbox agents. It exists to make the overall architecture implementable without further conceptual cleanup.

## Outcome
The mailbox-agent stack is divided into five layers:

1. `exchange-fs-sync`
   Deterministic inbound mailbox compiler
2. Foreman
   Routing, thread ownership, arbitration, and enqueue authority
3. `packages/charters`
   Role-specific operating profiles and structured output contracts
4. Auxiliary domain stores
   For example a SQLite obligations subsystem used by `obligation_keeper`
5. Outbound worker
   Durable side effects, draft management, retries, and reconciliation

## Core Invariants

1. A mailbox may have multiple attached charters.
2. Every mailbox thread has exactly one foreman authority.
3. Every mailbox thread has exactly one primary charter at a time.
4. Secondary charters may analyze and propose, but do not independently own outbound side effects.
5. The foreman, not a charter, decides what gets enqueued to outbound.
6. Outbound execution remains draft-first and separate from charter reasoning.

## Canonical Runtime Model

This is not fixed `N + 1` fan-out where all attached charters run on every thread.

Instead:

- `+1` foreman is mandatory
- charter fan-out is conditional
- most threads should invoke only the minimum useful charter set

Typical patterns:

- support thread:
  - foreman
  - `support_steward`
- support thread with commitments:
  - foreman
  - `support_steward`
  - `obligation_keeper`
- obligation-centric internal thread:
  - foreman
  - `obligation_keeper`

## Foreman Responsibilities

The foreman alone is responsible for:

- mailbox-to-charter attachment lookup
- thread identification and thread-state loading
- deciding which charters to invoke for a thread
- assigning and changing the primary charter
- validating charter outputs
- merging overlapping outputs
- arbitrating conflicting outputs
- enforcing action permissions
- emitting durable outbound proposals or commands
- recording thread-level state transitions

The foreman must not:

- become a generic replacement for charter-specific reasoning
- directly execute Graph side effects
- allow more than one charter to independently own outbound reply authority for the same thread

## Mailbox Attachment Model

Mailbox attachment belongs in coordinator configuration, not in `exchange-fs-sync` config and not inside charter definitions.

Illustrative canonical representation:

```typescript
type CharterId = "support_steward" | "obligation_keeper";

interface MailboxCharterBinding {
  mailbox_id: string;
  available_charters: CharterId[];
  default_primary_charter: CharterId;
  invocation_policies: CharterInvocationPolicy[];
}

interface CharterInvocationPolicy {
  charter_id: CharterId;
  mode: "always" | "conditional" | "manual";
  trigger_tags?: string[];
}
```

JSON shape:

```json
{
  "mailbox_bindings": {
    "help@global-maxima.com": {
      "available_charters": ["support_steward", "obligation_keeper"],
      "default_primary_charter": "support_steward",
      "invocation_policies": [
        {
          "charter_id": "support_steward",
          "mode": "always"
        },
        {
          "charter_id": "obligation_keeper",
          "mode": "conditional",
          "trigger_tags": ["contains_commitment", "has_due_date", "followup_needed"]
        }
      ]
    }
  }
}
```

Rules:

- every mailbox must declare a default primary charter
- every default primary charter must appear in `available_charters`
- conditional charters are not guaranteed to run on every thread
- charter-specific action permissions are enforced by foreman plus charter metadata

## Thread Ownership Model

Thread ownership belongs in durable coordinator state, likely SQLite.

Illustrative canonical representation:

```typescript
type ThreadStatus =
  | "new"
  | "triaging"
  | "active"
  | "waiting_external"
  | "waiting_internal"
  | "blocked"
  | "closed";

interface ThreadRecord {
  thread_id: string;
  mailbox_id: string;
  primary_charter: CharterId;
  secondary_charters: CharterId[];
  status: ThreadStatus;
  assigned_agent: string | null;
  last_message_at: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_analyzed_at: string | null;
  last_triaged_at: string | null;
  created_at: string;
  updated_at: string;
}
```

Rules:

- every thread must have exactly one primary charter
- `secondary_charters` may be empty
- a primary charter change is an explicit thread transition, not an implicit side effect of one charter’s opinion
- thread ownership state is independent from outbound command state

## Charter Invocation Contract

The foreman invokes a charter with structured input, not just free-form prompt text.

Illustrative canonical input:

```typescript
type AllowedAction =
  | "draft_reply"
  | "send_reply"
  | "send_new_message"
  | "mark_read"
  | "move_message"
  | "set_categories"
  | "extract_obligations"
  | "create_followup";

interface CharterInvocationInput {
  charter_id: CharterId;
  mailbox_id: string;
  thread_id: string;
  primary_charter: CharterId;
  secondary_charters: CharterId[];
  allowed_actions: AllowedAction[];
  thread_status: ThreadStatus;
  normalized_thread: NormalizedThreadContext;
  prior_outputs: CharterOutputEnvelope[];
  coordinator_flags: string[];
}

interface NormalizedThreadContext {
  subject: string;
  participants: string[];
  message_count: number;
  latest_message_id: string | null;
  messages: NormalizedThreadMessage[];
}

interface NormalizedThreadMessage {
  message_id: string;
  direction: "inbound" | "outbound" | "internal";
  received_at: string | null;
  from: string | null;
  to: string[];
  cc: string[];
  subject: string;
  body_text: string;
  body_html_present: boolean;
}
```

Rules:

- the foreman supplies the action permissions
- the charter may not expand its own action authority
- the charter input includes the current thread ownership state
- `prior_outputs` allow iterative analysis without losing history

## Structured Charter Output Contract

Every charter must return structured output that the foreman can validate and merge.

Illustrative canonical envelope:

```typescript
interface CharterOutputEnvelope {
  charter_id: CharterId;
  role: "primary" | "secondary";
  output_version: string;
  analyzed_at: string;
  summary: string;
  classifications: CharterClassification[];
  facts: ExtractedFact[];
  escalations: EscalationProposal[];
  proposed_actions: ProposedAction[];
}

interface CharterClassification {
  kind: string;
  confidence: "low" | "medium" | "high";
  rationale: string;
}

interface ExtractedFact {
  kind: string;
  value_json: string;
  source_message_ids: string[];
}

interface EscalationProposal {
  kind: string;
  reason: string;
  urgency: "low" | "medium" | "high";
}

interface ProposedAction {
  action_type: AllowedAction;
  authority: "proposed" | "recommended";
  payload_json: string;
  rationale: string;
}
```

Rules:

- outputs are not executable commands by themselves
- a charter proposes; the foreman validates and decides
- `payload_json` must conform to action-specific schemas outside the envelope
- every proposed action requires rationale

## Initial Charter Specialization

### `support_steward`

Default role:

- usually primary on customer support threads

Expected classifications:

- `bug_report`
- `access_issue`
- `how_to`
- `billing_question`
- `feature_request`
- `security_incident`

Typical proposed actions:

- `draft_reply`
- `set_categories`
- `move_message`
- `mark_read`

Forbidden to assume:

- obligation tracking is its durable persistence domain
- it may bypass the foreman and send directly

### `obligation_keeper`

Default role:

- usually secondary on support threads
- may be primary in obligation-centric workflows

Expected classifications:

- `contains_commitment`
- `has_due_date`
- `owner_unclear`
- `followup_needed`
- `overdue_commitment`

Typical proposed actions:

- `extract_obligations`
- `create_followup`
- `draft_reply`

Important boundary:

- `obligation_keeper` assumes a separate SQLite-backed obligations subsystem for durable obligation storage
- that subsystem does not belong in `packages/charters`

## Arbitration Rules

The foreman must apply the following rules:

1. Primary charter owns the main action recommendation for the thread.
2. Secondary charters may add facts, classifications, and subordinate proposals.
3. If a secondary charter proposes an action outside its authority, the action is rejected or downgraded to a non-executable note.
4. If outputs conflict:
   - facts may coexist if non-contradictory
   - conflicting classifications require explicit foreman arbitration
   - outbound-facing action proposals defer to the primary charter unless escalation rules override
5. Escalations may override normal primary-charter preference if the escalation kind is declared globally higher priority.

Illustrative priority order:

1. explicit escalation rule
2. primary-charter action recommendation
3. secondary-charter advisory proposal

## Outbound Boundary

The foreman does not send mail and does not mutate the mailbox directly.

Instead it emits durable outbound proposals or approved commands.

Illustrative canonical handoff:

```typescript
interface ForemanOutboundDecision {
  decision_id: string;
  mailbox_id: string;
  thread_id: string;
  source_charter_ids: CharterId[];
  approved_action: "send_reply" | "send_new_message" | "mark_read" | "move_message" | "set_categories";
  payload_json: string;
  rationale: string;
  decided_at: string;
}
```

Rules:

- charters do not directly enqueue outbound worker commands
- the foreman may normalize multiple charter proposals into one outbound decision
- outbound command creation happens after foreman validation, not inside charter output generation

## What Belongs In `packages/charters`

`packages/charters` should contain:

- charter metadata
- charter role defaults
- classification taxonomies
- action capability metadata
- structured output schemas or helpers
- human-readable charter descriptions

`packages/charters` should not contain:

- mailbox bindings
- thread ownership persistence
- coordinator routing logic
- obligations SQLite implementation
- outbound worker logic

## What Belongs In Coordinator Config

Coordinator config should hold:

- mailbox-to-charter attachments
- default primary charter per mailbox
- conditional invocation policies
- global escalation precedence
- charter enablement flags

## What Belongs In Coordinator State

Coordinator durable state should hold:

- thread records
- charter outputs by thread and time
- foreman arbitration outcomes
- outbound decisions emitted by the foreman

## Consequences For `packages/charters`

The later `packages/charters` package must be designed against this contract.

That means every charter must define:

- `charter_id`
- default role
- whether it may be primary
- action capability metadata
- classification kinds
- escalation kinds
- expected fact extraction kinds
- output schema compatibility

## Open Technical Dependency

The outbound handoff is now conceptually coherent, but one technical dependency remains unresolved:

- whether the outbound system’s primary reconciliation marker survives the intended Graph draft and send path

That dependency does not block the foreman contract, but it still blocks final confidence in the outbound implementation path.

## Definition Of Done

- [x] foreman or coordinator responsibilities are defined
- [x] mailbox attachment model is defined
- [x] thread ownership model is defined
- [x] charter invocation contract is defined
- [x] structured charter output contract is defined
- [x] arbitration rules are defined
- [x] outbound enqueue boundary is defined
- [x] implications for `packages/charters` are explicit
- [x] the architecture clearly supports `support_steward` and `obligation_keeper`

## Follow-On Work

1. Create `packages/charters` against this contract.
2. Add coordinator config for mailbox-to-charter bindings.
3. Add durable coordinator state for thread ownership and charter outputs.
4. Add obligations subsystem for `obligation_keeper`.
5. Validate the outbound Graph metadata path in the existing outbound task sequence.
