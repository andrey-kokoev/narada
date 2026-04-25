---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T13:35:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [556]
artifact: .ai/decisions/20260424-570-dispatch-zone-boundary-contract.md
---

# Task 570 - Dispatch Zone Boundary Contract

## Goal

Define dispatch/work pickup as a distinct Narada zone between assignment and execution.

## Required Work

1. Define the zone boundary between:
   - assignment
   - dispatch / work pickup
   - execution
2. State what each zone owns and what it does not own.
3. Define the distinct crossings:
   - assignment -> dispatch
   - dispatch -> execution
4. State why assignment alone is insufficient.
5. Record the result in canonical doctrine or chapter-local artifact.

## Acceptance Criteria

- [x] Dispatch is defined as a distinct zone
- [x] Assignment, dispatch, and execution are not collapsed
- [x] Crossings are explicit
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Artifact

Written `.ai/decisions/20260424-570-dispatch-zone-boundary-contract.md` (~10 KB) covering:
- Three-zone model: Assignment → Dispatch → Execution
- Zone ownership tables (what each zone owns and does NOT own)
- `DispatchPacket` crossing artifact shape
- Two six-field crossing regime declarations:
  - Assignment → Dispatch (admissibility: assignment unreleased, agent matches, no prior unexpired packet)
  - Dispatch → Execution (admissibility: lease valid, agent acknowledges context)
- Five invariants (at-most-one active packet, bounded lease, re-dispatch rules, read-only spec, idempotent pickup)
- Rationale: why assignment alone is insufficient (authority collapse, no timeout, no context, no re-dispatch, control-plane analogy)
- Deferred items table (concrete schema, SQLite table, heartbeat, auto re-dispatch, control-plane lease unification)

### Verification

- `pnpm verify` — 5/5 steps pass ✅
- `pnpm typecheck` — all 11 packages clean ✅
- Decision artifact exists and defines distinct zones with explicit crossings ✅

