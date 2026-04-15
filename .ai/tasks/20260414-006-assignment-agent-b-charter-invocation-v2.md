# Assignment — Agent B — Charter Invocation Contract v2

## Role

You are the charter contract engineer for Narada’s control plane.

Your job is to refine the charter invocation model so that charter execution consumes first-class control objects and produces structured results without accidentally becoming workflow authority.

## Scope

Primary target:
- `.ai/tasks/20260414-006-assignment-agent-b-charter-invocation-v2.md`

Read first:
- `.ai/tasks/20260414-002-foreman-core-ontology-and-control-algebra.md`
- `.ai/tasks/20260414-003-identity-lattice-and-canonical-keys.md`
- `.ai/tasks/20260414-004-coordinator-durable-state-v2.md`
- `.ai/tasks/20260413-007-foreman-and-charters-architecture.md`
- `.ai/tasks/20260413-011-charter-tool-bindings.md`

## Mission

Produce the v2 charter invocation contract aligned to the closed ontology and identity model.

## Core Invariants

1. Foreman remains the authority that decides whether and how a charter is invoked.
2. Charter execution must not directly mutate mailbox state.
3. Charter output must be structured enough for durable control-plane use.
4. Charter output must not smuggle implicit state transitions.
5. Tool access remains bounded by declared policy.

---

## Task 1 — Invocation Unit

**Decision:** A charter is invoked on a **`work_item`**.

**Justification:**
- The `conversation` is too coarse. A single conversation may require zero, one, or many independent actions over its lifetime. Scheduling at conversation granularity would force the foreman to repeatedly re-evaluate whether work is needed.
- The `conversation_revision` is too fine and derived. Revisions are compiler observations, not control decisions. Most revisions require no action, so scheduling per-revision would create an explosion of no-op work items.
- The `work_item` is the **smallest durable schedulable unit of control work**. It is created by the foreman when a conversation change triggers a concrete need for triage, analysis, or response. It carries explicit intent (e.g., triage, draft reply, obligation extraction) and supports leasing, retry, and terminal states.
- A work item implicitly carries the **latest conversation revision** as input context, but it is not keyed by that revision. If a new revision arrives while the work item is still open, the foreman may choose to supersede the work item and open a new one.

**Normative rule:**
> `work_item_id` is the terminal schedulable target for every charter invocation. The foreman leases a work item to an `execution_attempt`, and the attempt invokes the charter.

---

## Task 2 — Invocation Envelope

The foreman constructs and validates a `CharterInvocationEnvelope` for every execution attempt. This envelope is immutable for the duration of the attempt.

### Envelope Structure

```typescript
type CharterInvocationEnvelope = {
  // ── Canonical Identity ─────────────────────────────────────────────
  invocation_version: "2.0";
  execution_id: string;           // ex_<uuid> — bounded attempt identity
  work_item_id: string;           // wi_<uuid> — durable job identity
  conversation_id: string;        // Graph conversationId — canonical thread
  mailbox_id: string;             // mailbox scope

  // ── Invocation Context ─────────────────────────────────────────────
  charter_id: CharterId;
  role: "primary" | "secondary";
  invoked_at: string;             // ISO 8601
  revision_id: string;            // {conversation_id}:rev:{ordinal} — input snapshot

  // ── Normalized Mailbox Context ─────────────────────────────────────
  thread_context: NormalizedThreadContext;

  // ── Policy Inputs ──────────────────────────────────────────────────
  allowed_actions: AllowedAction[];
  available_tools: ToolCatalogEntry[];
  coordinator_flags: string[];    // e.g., ["urgent", "human_review_required"]

  // ── Bounded Prior Context ──────────────────────────────────────────
  prior_evaluations: PriorEvaluation[];
  max_prior_evaluations: number;  // enforced by foreman (default: 5)
};

type PriorEvaluation = {
  evaluation_id: string;          // eval_<execution_id>
  charter_id: CharterId;
  role: "primary" | "secondary";
  evaluated_at: string;
  summary: string;
  key_classifications: { kind: string; confidence: "low" | "medium" | "high" }[];
};
```

### Envelope Rules

1. **Identity completeness:** The envelope must contain `execution_id`, `work_item_id`, `conversation_id`, and `mailbox_id`. Missing any of these is a fatal validation error.
2. **Role authority:** `role` is assigned by the foreman based on mailbox binding config. A charter may not reclassify itself as primary.
3. **Action bounding:** `allowed_actions` is the exclusive upper bound. If a charter proposes an action not in this list, the foreman rejects the proposal.
4. **Tool bounding:** `available_tools` lists only tools this charter is bound to for this mailbox. Thread-level foreman overrides may remove tools; they may not add tools outside the mailbox binding.
5. **Prior context bounding:** `prior_evaluations` is a foreman-compressed summary, not a raw trace dump. It excludes failed attempts, superseded work items, and evaluations older than a mailbox-specific horizon.
6. **Revision reference:** `revision_id` names the conversation revision that provided `thread_context`. It is for correlation and replay, not for reconstituting the context.

---

## Task 3 — Output Envelope

Every charter must return a `CharterOutputEnvelope`. The foreman validates this envelope before reading any of its contents.

### Envelope Structure

```typescript
type CharterOutputEnvelope = {
  // ── Output Identity ────────────────────────────────────────────────
  output_version: "2.0";
  execution_id: string;           // must match invocation envelope
  charter_id: CharterId;
  role: "primary" | "secondary";
  analyzed_at: string;            // ISO 8601

  // ── Evaluation Outcome ─────────────────────────────────────────────
  outcome: "complete" | "clarification_needed" | "escalation" | "no_op";

  // ── Confidence / Uncertainty ───────────────────────────────────────
  confidence: {
    overall: "low" | "medium" | "high";
    uncertainty_flags: string[];  // e.g., ["ambiguous_sender_intent", "missing_customer_record"]
  };

  // ── Machine-Readable Commentary ────────────────────────────────────
  summary: string;                // max 500 chars; human-readable but stable
  classifications: CharterClassification[];
  facts: ExtractedFact[];

  // ── Recommended Action Class ───────────────────────────────────────
  recommended_action_class?:
    | "draft_reply"
    | "send_reply"
    | "send_new_message"
    | "mark_read"
    | "move_message"
    | "set_categories"
    | "extract_obligations"
    | "create_followup"
    | "tool_request"
    | "no_action";

  // ── Outbound Proposal Payload ──────────────────────────────────────
  proposed_actions: ProposedAction[];

  // ── Tool Requests ──────────────────────────────────────────────────
  tool_requests: ToolInvocationRequest[];

  // ── Escalations ────────────────────────────────────────────────────
  escalations: EscalationProposal[];

  // ── Free-Form Commentary (discarded after read) ────────────────────
  reasoning_log?: string;         // transient; foreman may log it as trace
};

type CharterClassification = {
  kind: string;
  confidence: "low" | "medium" | "high";
  rationale: string;              // max 1000 chars
};

type ExtractedFact = {
  kind: string;
  value_json: string;             // JSON-encoded fact value
  source_message_ids: string[];   // conversation-local message ids
  confidence: "low" | "medium" | "high";
};

type ProposedAction = {
  action_type: AllowedAction;
  authority: "proposed" | "recommended";
  payload_json: string;           // action-specific schema
  rationale: string;
};

type EscalationProposal = {
  kind: string;
  reason: string;
  urgency: "low" | "medium" | "high";
  suggested_recipient?: string;   // e.g., "senior_support"
};
```

### Outcome Semantics

| `outcome` | Meaning | Foreman Treatment |
|-----------|---------|-------------------|
| `complete` | Charter produced a confident or actionable evaluation | Foreman proceeds to validation and arbitration |
| `clarification_needed` | Charter cannot decide without more context | Foreman may re-invoke with expanded tools, escalate to human, or resolve as no-op |
| `escalation` | Charter explicitly requests human or higher authority | Foreman routes to escalation queue; action proposals are advisory only |
| `no_op` | Charter believes no action is required | Foreman may accept and resolve the work item without outbound proposal |

### Machine-Readable vs Free-Form Commentary

- **Machine-readable:** `classifications`, `facts`, `proposed_actions`, `tool_requests`, `escalations`, `confidence`, `recommended_action_class`. These are parsed by the foreman and persisted in the `evaluation` record.
- **Free-form commentary:** `summary` (bounded-length, human-readable) and `reasoning_log` (unbounded, transient). The foreman may write `reasoning_log` to the trace store, but it is **never** used to drive workflow state.

---

## Task 4 — Idempotency / Replay

### Repeated Execution on the Same Work Item

- Each retry of a work item receives a **new `execution_id`**.
- The foreman may supply the same or a refreshed `revision_id` and `thread_context`.
- The charter is **not required** to produce bit-identical output across retries, but it **is required** to produce **semantically compatible** outputs given the same inputs.
- The foreman treats each successful execution attempt as an independent `evaluation`. It may keep multiple evaluations for the same work item, but only one is typically used for resolution.

### New Revision Superseding Prior Work

- If a new `conversation_revision` arrives while a `work_item` is `opened` or `leased`, the foreman has two options:
  1. **Supersede:** Cancel the old work item and create a new one against the latest revision.
  2. **Continue:** Allow the current attempt to finish, then evaluate whether a follow-up work item is needed.
- A charter is **never** invoked against a superseded work item.
- Evaluations produced against an older revision remain valid as historical commentary but are not used for new resolutions unless the foreman explicitly includes them in `prior_evaluations`.

### Partial Failure After Output Emitted

- If the charter runtime returns a valid `CharterOutputEnvelope` but crashes during trace flushing or network teardown, the output envelope is considered **durable** if it was successfully transmitted to the foreman.
- If the foreman crashes after receiving the envelope but before persisting the `evaluation` and updating the `work_item`, crash recovery proceeds from the `work_item` and `execution_attempt` state:
  - The `execution_attempt` record shows `succeeded` and the output checksum (or full payload) is stored.
  - The foreman reconciles: if `evaluation_id = eval_<execution_id>` is missing, it re-materializes the evaluation from the attempt record and continues resolution.
- If the output envelope was lost in transit, the execution attempt is marked `crashed` or `abandoned`, and the work item is re-leased for retry.

**Normative replay rule:**
> Crash recovery must succeed using only `work_item`, `execution_attempt`, and `outbound_command` state. Traces and evaluations may be regenerated; they are not required for resumption.

---

## Task 5 — Trace Relationship

Charter-generated commentary is partitioned into four durability classes:

| Artifact | Destination | Durability | Purpose |
|----------|-------------|------------|---------|
| **Structured evaluation** | `evaluation` table (or equivalent durable row) | Permanent | Foreman arbitration, audit, and prior-context summaries |
| **Execution trace** | `trace` table / agent trace store | Permanent (but pruneable) | Debugging, compliance, reasoning transparency |
| **Embedded note** | `work_item` note field or `conversation` metadata | Durable if foreman persists it | Human-readable summary attached to workflow object |
| **Transient reasoning** | `reasoning_log` in output envelope | Discarded after trace write | Free-form LLM chain-of-thought; never read by scheduler |

### Rules

1. The `evaluation` record contains only the **machine-readable** subset of the output envelope (`classifications`, `facts`, `proposed_actions`, `tool_requests`, `escalations`, `confidence`, `recommended_action_class`, `outcome`, `summary`).
2. The `trace` store receives the full output envelope plus any intermediate reasoning steps, tool call logs, and token usage metrics.
3. The foreman may extract `summary` from the evaluation and write it as an embedded note on the `work_item` or `conversation` record for UI convenience.
4. `reasoning_log` must never be parsed by the foreman to infer state transitions.
5. Deleting all traces must not impair the next scheduling cycle or crash recovery.

---

## Task 6 — Boundary Rules

Charters are strictly bounded evaluators. The following are **forbidden**:

### 1. No Outbound Command Creation
A charter may propose actions, but it may not:
- Create `outbound_command` rows
- Directly enqueue work to the outbound worker
- Emit raw Graph API mutation payloads outside the foreman-validated `proposed_actions` envelope

### 2. No Direct Draft Mutation
A charter may propose `draft_reply` or `send_reply`, but it may not:
- Call Graph API to create, update, or send drafts
- Access the mailbox through any channel other than the normalized thread context supplied by the foreman

### 3. No Direct Mutation of Scheduler Truth
A charter may not:
- Update `work_item` state (status, lease, resolution)
- Create or cancel work items
- Modify thread ownership records (`primary_charter`, `status`, `assigned_agent`)
- Alter coordinator flags or scheduling policy

### 4. No Silent Authority Over Resolution State
A charter may not:
- Return outputs that the foreman is expected to apply automatically without validation
- Use `authority: "recommended"` as a mandate; it remains a proposal
- Embed state-transition side effects inside `payload_json`
- Declare that a work item is "resolved" or "closed"

### 5. No Tool Authority Expansion
A charter may not:
- Request tools not listed in `available_tools`
- Override `read_only`, `timeout_ms`, or `requires_approval` bindings
- Pass credentials or secrets in tool arguments

### 6. No Self-Promotion
A charter may not:
- Change its own `role` from `secondary` to `primary`
- Declare itself the new primary charter for the thread

---

## Foreman Validation Rules for Accepting Charter Output

Before an `evaluation` is persisted and before any `outbound_proposal` is emitted, the foreman must validate the `CharterOutputEnvelope`:

1. **Execution identity match:** `execution_id` in the output must equal the `execution_id` in the invocation envelope.
2. **Charter identity match:** `charter_id` and `role` must match the invocation envelope.
3. **Output version:** `output_version` must be `"2.0"`. Unrecognized versions are rejected.
4. **Action bounding:** Every `proposed_actions[i].action_type` must appear in `allowed_actions`. Violations cause the action to be stripped; if all actions are stripped, the envelope is treated as `no_op`.
5. **Tool bounding:** Every `tool_requests[i].tool_id` must appear in `available_tools`. Violations cause the request to be stripped.
6. **Payload parsability:** Every `payload_json` must parse as valid JSON. Unparseable payloads cause the enclosing action to be stripped.
7. **Escalation precedence:** If any `escalation` has `urgency: "high"`, the foreman may short-circuit normal arbitration and route directly to escalation handling.
8. **Confidence floor:** If `confidence.overall === "low"` and `outcome !== "escalation"`, the foreman may downgrade `recommended_action_class` to `no_action` or require human review.
9. **Primary charter ownership:** If a secondary charter proposes an action with `authority: "recommended"` that conflicts with the primary charter’s recommendation, the primary charter prevails unless an escalation rule overrides.
10. **No-op completeness:** `outcome === "no_op"` is valid only if `proposed_actions` is empty and `escalations` is empty. If the charter proposes actions while claiming `no_op`, the foreman corrects the outcome to `complete` or strips the actions.

---

## Deliverables Checklist

- [x] Input envelope spec
- [x] Output envelope spec
- [x] Invocation rules
- [x] Idempotency and replay rules
- [x] Foreman validation rules for accepting charter output

## Parallel To

May run in parallel with:
- Agent A — Scheduler and Leases
- Agent C — Tool Binding Runtime
- Agent D — Outbound Handoff v2
- Agent E — Replay and Recovery Tests
- Agent F — Daemon-Foreman Dispatch

## Constraints

Do not:
- implement tool adapters
- implement daemon wake logic
- design final SQL schema
- promote charter output into implicit workflow truth
