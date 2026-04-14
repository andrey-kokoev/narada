# Architecture Review: Agent Trace Persistence

**Target:** `.ai/tasks/20260413-009-agent-trace-persistence.md`  
**Reviewer:** Task 010 — De-arbitrarized Architecture Review  
**Date:** 2026-04-13

---

## 1. Verdict

**APPROVE_WITH_CHANGES**

The proposal is directionally sound: traces are positioned as append-only local commentary, module placement inside `packages/exchange-fs-sync` is justified, and the schema is pragmatic for a v1 coordination layer. However, the design contains an **ordering cavity**, a **foreign-key coupling hazard**, and an **unlinked-decision false-ground risk** that must be closed before implementation begins. These are not taste issues; they are semantic boundary defects that could cause traces to be mistaken for authority or to block command retention.

---

## 2. Required Changes

### 2.1 Close the ordering cavity
- **Problem:** Ordering relies solely on `created_at` text. If two traces are written in the same millisecond, `readByThread` and `readBySession` have no deterministic tie-breaker. SQLite may return them in unstable order depending on index traversal.
- **Why it matters:** Replay and hydration depend on stable trace ordering. Nondeterministic ordering breaks agent context reconstruction.
- **Required correction:** Add an explicit ordering primitive. Either:
  - expose `rowid` in reads and sort by `(created_at desc, rowid desc)` / `(created_at asc, rowid asc)`, or
  - add an integer `ordinal` column populated from a per-database or per-thread monotone sequence.

### 2.2 Remove or soften the hard foreign key from `reference_outbound_id` to `outbound_commands`
- **Problem:** The schema declares `reference_outbound_id text references outbound_commands(outbound_id)` with no `on delete` clause. SQLite defaults to `RESTRICT`. This couples trace longevity to command longevity and prevents independent retention policies.
- **Why it matters:** Traces are audit/debug residue. If outbound commands are pruned or archived, traces should survive as orphaned references (or be optionally pruned separately). A hard FK makes traces accidental guardians of command rows.
- **Required correction:** Either:
  - remove the FK constraint and treat `reference_outbound_id` as a logical reference only, or
  - change it to `references outbound_commands(outbound_id) on delete set null` and make the column nullable.

### 2.3 Soften or remove the self-referential FK on `parent_trace_id`
- **Problem:** `parent_trace_id text references agent_traces(trace_id)` also defaults to `RESTRICT`, making trace deletion or compaction blocked by child traces.
- **Why it matters:** Future retention or compaction will fail cascade-style unless this is addressed now.
- **Required correction:** Change to `on delete set null` or remove the FK constraint.

### 2.4 Clarify the `thread_id` ↔ `conversation_id` relationship
- **Problem:** The filesystem view layer (`src/persistence/views.ts`) builds `by-thread` directories using `conversation_id` from `NormalizedMessage`. The outbound schema and trace proposal use `thread_id`. The proposal never states whether these are the same value or what derivation rule applies.
- **Why it matters:** If a future change derives `thread_id` differently from `conversation_id`, trace-to-view alignment breaks silently.
- **Required correction:** Document explicitly in the trace schema comments or types that `thread_id` in this table is exactly the Exchange `conversation_id` (or whatever deterministic derivation rule is canonical). If they can diverge, add a `conversation_id` column so traces can join to both outbound commands and filesystem views.

### 2.5 Add a read surface for unlinked decisions (or forbid writing them)
- **Problem:** The review failure mode — *coordinator writes a `decision` trace, then crashes before creating the outbound command* — leaves a trace with `reference_outbound_id = null`. The current interface has no way to query "decision traces that have no linked command."
- **Why it matters:** Without this read surface, a future maintainer may build ad-hoc SQL to "recover" from these traces, treating commentary as workflow authority.
- **Required correction:** Either:
  - add `readUnlinkedDecisions(opts?: { types?: TraceType[] }): AgentTrace[]` to the store interface, paired with a documented rule that the coordinator must reconcile them to commands or mark them superseded, or
  - document a hard invariant: **decision traces must only be written after the outbound command exists and `reference_outbound_id` is set.**

---

## 3. Recommended Changes

- **Add `rowid` to the `AgentTrace` type (or an explicit `ordinal`)** so consumers can use it as a stable cursor for pagination instead of timestamp strings.
- **Document payload conventions as invariants, not suggestions.** The payload table is helpful, but if fields like `intent` or `confidence` become required for certain trace types, state that explicitly so the store interface can evolve without guessing.
- **Consider a lightweight `trace_metadata` JSON column** for fields that are expected to be query-stable (e.g., `intent`, `confidence`, `to_agent`) separate from the free-form narrative `payload_json`. This avoids future schema migration pressure when replay logic needs to filter on common metadata.
- **Index on `(thread_id, created_at desc, rowid desc)`** (or equivalent) to make the ordering guarantee cheap at the storage layer.

---

## 4. Open Risks

- **Payload opacity drift:** Because `payload_json` is fully opaque, different agents may evolve incompatible payload shapes. Schema alone cannot enforce convention; an operational invariant (e.g., "all `decision` payloads MUST include `intent`") must be documented and enforced at the coordinator layer.
- **Trace growth without retention:** The schema has no `archived_at`, `retain_until`, or compaction boundary. This is acceptable for v1, but operators must be warned that unbounded growth in high-traffic mailboxes will eventually affect read latency. `created_at` enables time-based pruning later, but only if FK constraints do not block it.
- **Agent-to-agent convention coupling:** The `trace_type` enum is a soft contract. If one agent writes `action` traces and another expects `decision` traces to drive behavior, the boundary between commentary and authority will blur.
- **Session ID entropy:** `session_id` is an optional string with no lifecycle table. If coordinators reuse session IDs across unrelated bursts of work, `readBySession` may return semantically disconnected traces.

---

## 5. Identity Map

| Identity | Role in Trace Layer | Classification |
|----------|---------------------|----------------|
| `thread_id` | Primary grouping key for traces; must match outbound command `thread_id` | **Canonical join key** |
| `conversation_id` (Exchange / Graph) | Underlying remote thread identity; used by `FileViewStore` to build `by-thread` views | **Canonical conversation identity** (must be documented as equivalent to `thread_id` or added as a column) |
| `reference_message_id` | Optional pointer to a specific message that triggered or was the target of a trace | **Acceptable reference** (logical only, no FK) |
| Graph message `id` | Remote message identifier; may be stored in `reference_message_id` but is foreign to local state | **Foreign / acceptable reference** |
| `reference_outbound_id` | Optional pointer to an outbound command; currently proposed as hard FK | **Wrong-level identity if hard-FK'd** — should be logical reference only |
| `session_id` | Correlation token for a burst of agent work | **Correlation token** (not a lifecycle object or recovery anchor) |
| `trace_id` | Local surrogate key for a single trace row | **Canonical trace identity** |

---

## 6. Boundary Statement

> Agent traces are **local, append-only commentary** about agent reasoning and observations. They may be used for context hydration, debugging, and audit, but they are **explicitly not** authoritative sync state, workflow state, command state, or recovery state. No actor — including the outbound worker — may make policy or send decisions based on the contents of the trace log. A trace record of a "decision" does not constitute the decision itself; the outbound command table remains the sole authority for executable intent.
