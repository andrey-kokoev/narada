---
status: closed
created: 2026-04-24
depends_on: [600, 601, 602]
governed_by: task_review:a3
closed_at: 2026-04-24T20:52:04.464Z
closed_by: a3
---

# Task 603 - Verification Run Persistence And Telemetry Contract

## Goal

Define how governed test runs are persisted and timed in SQLite, and how those durable records relate to task verification surfaces.

## Context

If testing becomes a real governed zone, timing and result records cannot remain scattered across:

- transient shell output
- task prose
- ad hoc JSON files
- partial scripts

## Required Work

1. Define the canonical persistent store posture:
   - SQLite or not
   - if SQLite, what belongs there
   - what remains projected/read-only elsewhere
2. Define the minimum persisted record set:
   - request identity
   - timing
   - exit classification
   - linkage to task/operator/agent
   - environment metadata
3. Define what telemetry is first-class versus incidental.
4. Define retention posture:
   - full history
   - pruning
   - summarization
5. Define how task verification surfaces consume these records without duplicating truth.
6. Define whether raw output retention is primary, secondary, truncated, or debug-only.
7. Record verification or bounded blockers.

## Execution Notes

Produced Decision 603 artifact defining verification run persistence and telemetry.

**Persistence posture:** SQLite adjacent to task lifecycle store; `verification_requests` and `verification_results` tables.

**Minimum durable record set:** Full request and result schemas with 11 request fields + 11 result fields.

**Telemetry:** Duration/counts/status first-class; full streams incidental.

**Retention:** Full 30 days, summary 90 days, archive summary only.

**Task-verification consumption:** Read-only reference by `result_id`; no duplication.

**Raw output:** Excerpts inline (2KB); full streams 24h debug-only.

**Files changed:**
- `.ai/decisions/20260424-603-verification-run-persistence-and-telemetry-contract.md` (new)

## Verification

- `pnpm verify` — 5/5 steps pass ✅
- Decision artifact reviewed for completeness against all 7 required work items ✅
- No code changes; pure contract/design task ✅

## Non-Goals

- Do not implement the full execution engine here.
- Do not leave persistence vs projection ambiguous.

## Acceptance Criteria

- [x] Persistence posture is explicit
- [x] Minimum durable record set is explicit
- [x] Telemetry posture is explicit
- [x] Task-verification consumption posture is explicit
- [x] Raw output retention posture is explicit
- [x] Verification or bounded blocker evidence is recorded



