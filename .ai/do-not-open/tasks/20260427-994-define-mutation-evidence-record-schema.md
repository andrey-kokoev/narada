---
status: opened
amended_by: architect
amended_at: 2026-04-27T21:49:38.841Z
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

- [ ] Schema includes operation id, authority class, command/operator, locus, principal, subject identity, before/after state, timestamp, confirmation/read-back, and replay payload.
- [ ] Types and validators exist in the appropriate CLI/task-governance package boundary.
- [ ] Docs classify snapshots as transitional projection guards and mutation records as intended append-only evidence.
- [ ] Focused tests validate record shape and stable serialization.
- [ ] `pnpm verify` passes.
