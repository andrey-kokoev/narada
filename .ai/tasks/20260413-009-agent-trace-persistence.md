# Agent Task: Validate and Repair — Agent Trace Persistence

> **Cross-reference:** Physical co-location with coordinator DB and soft-reference
> semantics for `reference_outbound_id` are resolved in
> `.ai/tasks/20260413-012-coordinator-state-and-foreman-handoff.md`.

## Inputs

- Target spec:  
  `.ai/tasks/20260413-009-agent-trace-persistence.md` :contentReference[oaicite:0]{index=0}

- Context (read only if needed):
  - `.ai/tasks/20260413-001-outbound-draft-worker-spec.md`
  - `packages/exchange-fs-sync/src/outbound/schema.sql`
  - `packages/exchange-fs-sync/src/types/normalized.ts`
  - `packages/exchange-fs-sync/src/persistence/views.ts`

---

## Mission

Evaluate whether the proposed **agent trace persistence layer** is:

- semantically well-defined,
- safe under long-lived workloads,
- correctly placed,
- and incapable of becoming accidental system-of-record state.

If not, **repair the design**.

This is not just a review.  
This is a **review + correction task**.

---

## Core Question

You must resolve:

> What is an agent trace in this system, and what is it explicitly forbidden to become?

If that boundary is unclear or unenforceable, the design is invalid.

---

## System Invariants (Do Not Violate)

1. Filesystem (`messages/`, `views/`) = compiled remote state (not writable coordination state)
2. SQLite = canonical local durability layer
3. Outbound worker = sole authority over drafts/commands
4. Agent traces = **append-only commentary / evidence**, not:
   - sync truth
   - workflow truth
   - command truth

If the spec violates these, it must be corrected.

---

## Task Phases

### Phase 1 — Semantic Extraction

Extract the intended meaning (2–5 bullets each):

- trace
- observation
- decision
- session
- linkage to outbound commands

Then classify:
- distinct
- partially collapsed
- ambiguous

---

### Phase 2 — Failure Scan

Identify whether the design allows:

- traces to become source of truth
- ordering ambiguity
- identity drift
- recovery ambiguity
- coupling to outbound lifecycle

List concrete failure modes (not opinions).

---

### Phase 3 — Decision

Produce one:

- `APPROVE`
- `APPROVE_WITH_CHANGES`
- `BLOCK`

Criteria:

- APPROVE → no semantic ambiguity + no structural gaps
- APPROVE_WITH_CHANGES → direction correct but fixable gaps
- BLOCK → ontology or identity is broken

---

### Phase 4 — Repair (Mandatory unless APPROVE)

If verdict ≠ APPROVE:

Produce a **corrected version of the spec**.

#### Rules for rewrite

- Preserve structure where possible
- Fix only what is necessary
- Do not expand scope
- Do not introduce new subsystems
- Resolve:
  - ordering model
  - identity model
  - boundary rules
  - minimal interface gaps
  - retention stance (explicitly stated)

Output must be a **full replacement document**, not a diff.

---

## Required Analysis Dimensions

You must explicitly evaluate:

### 1. Ontology

- Are traces events, logs, decisions, or mixed?
- Can any trace become required for recovery?
- Is “commentary vs state” boundary enforceable?

---

### 2. Identity Model

Evaluate correctness of:

- `thread_id`
- `conversation_id`
- `reference_message_id`
- `reference_outbound_id`

Classify each as:
- canonical
- derived
- foreign
- unsafe coupling

---

### 3. Ordering Model

Determine if ordering is stable under:

- same timestamp writes
- concurrent agents

If not, define required ordering primitive.

---

### 4. Persistence Longevity

Evaluate behavior with:
- thousands of traces per thread
- months of history
- repeated hydration

Focus on:
- read patterns
- index alignment
- semantic clarity

---

### 5. Store Interface

Check if interface supports:

- append
- replay
- session reconstruction
- recent context
- crash recovery

Identify missing read paths if they force ad hoc SQL.

---

### 6. Session Semantics

Determine whether `session_id` is:

- correlation only
- lifecycle object
- recovery anchor

If overloaded → must be corrected.

---

### 7. Retention Model

Decide explicitly:

- append-forever acceptable (yes/no)
- if no → minimal schema affordance required

---

### 8. Outbound Boundary

Evaluate:

Failure case:
> decision trace written, coordinator crashes before command

Determine if:
- acceptable (commentary only)
- dangerous (false-ground)
- needs schema/interface fix

---

### 9. Module Placement

Validate:

`packages/exchange-fs-sync/src/agent/traces/`

vs

`src/persistence/...`

Answer in terms of **ownership semantics**, not structure.

---

## Output Format

### 1. Verdict

One of:
- APPROVE
- APPROVE_WITH_CHANGES
- BLOCK

Short rationale.

---

### 2. Critical Failures

List only issues that affect correctness or semantics.

---

### 3. Required Changes

For each:
- Problem
- Why it matters
- Correction

---

### 4. Corrected Spec (only if needed)

Full rewritten version of:
`.ai/tasks/20260413-009-agent-trace-persistence.md`

Must be self-contained and ready for implementation.

---

### 5. Boundary Statement

End with:

> Agent traces are …

Complete the sentence so misuse becomes harder.

---

## Constraints

Do not:

- write implementation code
- introduce new services/packages
- convert traces into event sourcing
- optimize for analytics use cases
- leave ambiguity unresolved

---

## Success Condition

The result is valid if:

- a future implementer cannot mistake traces for system state
- identity is unambiguous
- ordering is deterministic
- recovery behavior is explainable without interpretation
- the spec can be implemented without additional design decisions