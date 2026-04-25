# Trace System Re-anchored on Canonical Identity

## Context

Tasks 024, 025, and 026 establish:

- crash/replay determinism
- runtime correctness without silent fallback
- explicit identity unification across `conversation_id`, `thread_id`, and `session_id`

Once identity is closed, the trace system can no longer remain loosely attached or legacy-shaped.

Right now, traces are at risk of becoming:

- fragmented across overlapping identity domains
- partially authoritative by accident
- difficult to correlate with execution, replay, and recovery

This task re-anchors traces onto the canonical identity model and demotes them permanently to commentary/evidence.

## Goal

Redefine and implement the trace system so that:

> traces are attached to canonical execution context, never used as control truth, and always interpretable through the identity lattice established in Task 026.

## Required Decisions

### 1. Primary Trace Anchor

Choose the primary attachment point for traces:

- `execution_id`
- `session_id`
- `work_item_id`

You may allow secondary references, but one must be canonical.

You must justify why the chosen anchor is the correct one for:

- replay inspection
- debugging
- auditability
- crash analysis

### 2. Secondary References

Define which additional references a trace may carry:

- `conversation_id`
- `thread_id`
- `work_item_id`
- `execution_id`
- `session_id`
- `outbound_id`

These must be explicit and non-authoritative.

### 3. Trace Semantics

Define what a trace is allowed to represent.

Allowed examples:
- runtime observation
- tool call commentary
- decision explanation
- handoff note
- debug evidence

Disallowed examples:
- source of truth for work resolution
- source of truth for outbound idempotency
- lease state
- replay cursor
- scheduler truth

## Required Schema Changes

Design and implement the canonical trace schema.

At minimum decide:

- whether to keep `agent_traces` or replace it
- whether traces reference `execution_attempts`
- whether session linkage is explicit
- whether trace types remain free-form or closed enum

Recommended minimum shape:

- `trace_id`
- canonical anchor id
- `conversation_id`
- `session_id` if applicable
- `trace_type`
- `payload_json`
- `created_at`

No control-plane correctness may depend on this table.

## Required Code Changes

- update trace store interfaces to use canonical identity
- remove legacy ambiguity around `thread_id`-first trace reads
- ensure trace writes happen only as side-band commentary
- ensure daemon / runtime / tool layers write traces consistently against the chosen anchor

## Required Read Surfaces

Define and implement the minimal read surfaces required for real use:

- read by canonical anchor
- read by conversation
- optional read by session
- optional read by outbound id

Do not add speculative analytics reads.

## Required Tests

Add tests proving:

1. traces remain queryable after crash/restart
2. traces never determine work resolution
3. traces correlate deterministically to execution context
4. traces from multiple sessions on same conversation do not collapse incorrectly
5. deleting or superseding work does not corrupt historical trace interpretation

## Invariants

1. Trace records are commentary, not authority.
2. Every trace belongs to exactly one canonical anchor.
3. Any additional references are navigational only.
4. Scheduler, lease, replay, and outbound correctness never depend on traces.
5. Trace reads may aid humans and diagnostics, but may not alter control flow.

## Non-Goals

- do not redesign scheduler
- do not redesign outbound worker
- do not introduce analytics/search product features
- do not make traces a second event log
- do not use traces to solve identity problems that belong in Task 026

## Deliverables

- updated trace schema
- updated trace types/store interfaces
- implementation aligned to canonical identity
- tests proving non-authoritative status
- brief note in docs stating what traces are and are not

## Acceptance Criteria

- traces attach to one explicit canonical anchor
- trace lookup is identity-safe
- no correctness path depends on traces
- historical traces remain interpretable under replay and supersession
- tests pass

## Definition of Done

The trace system is:

- canonically anchored
- semantically demoted
- operationally useful
- incapable of silently becoming control truth