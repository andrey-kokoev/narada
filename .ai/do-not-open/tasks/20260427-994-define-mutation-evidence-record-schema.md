---
status: closed
amended_by: architect
amended_at: 2026-04-27T21:49:38.841Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T22:14:28.731Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T22:14:29.238Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Define mutation evidence record schema

## Chapter

canonical-mutation-evidence-implementation

## Goal

Define the canonical mutation evidence record that SQLite-backed governed mutations must emit before Git can carry replayable authority evidence.

## Context

Canonical Mutation Evidence says SQLite is local runtime substrate and Git should carry mergeable mutation evidence. Before command implementations can emit records, Narada needs a stable record schema, serialization law, validation surface, and directory posture.

## Required Work

1. Define TypeScript types for mutation evidence records and supported family/kind values.
2. Define stable serialization, deterministic operation id rules, and validation errors.
3. Document the on-disk Git-visible location and relationship to existing snapshots and inbox envelopes.
4. Add tests for valid records, missing required fields, stable serialization, and deterministic ids.
5. Keep snapshots classified as transitional projection guards, not final authority logs.

## Non-Goals

- Do not retrofit all mutation commands in this task.
- Do not remove SQLite or current snapshots.
- Do not implement replay/reconcile command here.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Schema includes operation id, authority class, command/operator, locus, principal, subject identity, before/after state, timestamp, confirmation/read-back, and replay payload.
- [x] Types and validators exist in the appropriate CLI/task-governance package boundary.
- [x] Docs classify snapshots as transitional projection guards and mutation records as intended append-only evidence.
- [x] Focused tests validate record shape and stable serialization.
- [x] `pnpm verify` passes.
