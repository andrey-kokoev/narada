---
status: opened
depends_on: [995, 996]
amended_by: architect
amended_at: 2026-04-27T21:49:40.358Z
---

# Add mutation evidence reconcile command

## Chapter

canonical-mutation-evidence-implementation

## Goal

Add a bounded reconcile/import command that replays Git-visible mutation evidence into local SQLite projections and reports drift without merging raw SQLite files.

## Context

After tasks 994-996 introduce mutation evidence, Narada needs the operator surface that makes the doctrine practical after pull/checkout: validate evidence, replay into local SQLite, compare projection snapshots, and report bounded drift.

## Required Work

1. Add a mutation-evidence reconcile command with dry-run and apply modes.
2. Validate record schema, operation id uniqueness, family support, and replay ordering.
3. Replay supported task lifecycle and inbox evidence into local SQLite projections idempotently.
4. Report missing, stale, duplicate, malformed, and conflicting evidence with bounded output and exact next commands.
5. Add tests for idempotent replay, malformed evidence refusal, and drift reporting.

## Non-Goals

- Do not merge raw SQLite files.
- Do not silently repair conflicts without explicit apply mode.
- Do not support every future evidence family in v0.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Command validates evidence records before replay.
- [ ] Command can dry-run and apply for task lifecycle and inbox evidence families.
- [ ] Command reports stale, missing, duplicate, and conflicting operation ids with bounded output.
- [ ] Tests prove idempotent replay and refusal of malformed evidence.
- [ ] `pnpm verify` passes.
