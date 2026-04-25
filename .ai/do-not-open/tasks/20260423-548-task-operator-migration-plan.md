---
status: closed
created: 2026-04-23
closed_at: 2026-04-24T16:36:00.000Z
closed_by: codex
governed_by: task_close:codex
depends_on: [546]
artifact: .ai/decisions/20260424-548-task-operator-migration-plan.md
---

# Task 548 - Task Operator Migration Plan

## Goal

Define how the existing task lifecycle operators migrate to SQLite-backed state authority without breaking current governed flows.

## Required Work

1. Map current operators onto the future authority model:
   - claim,
   - continue,
   - report,
   - review,
   - finish,
   - close,
   - evidence,
   - graph/inspection.
2. State which operators become SQLite writers, markdown readers, or projection readers.
3. Define migration ordering so Narada can move incrementally without an all-at-once cutover.
4. Record bounded compatibility requirements.
5. Write the migration-plan artifact to `.ai/decisions/`.

## Acceptance Criteria

- [x] Migration-plan artifact exists.
- [x] Operator mapping is explicit.
- [x] Incremental migration order is explicit.
- [x] Compatibility requirements are explicit.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Scope

Executed the operator migration planning task directly by mapping the current task operator family onto the future SQLite-authoritative lifecycle model defined in Decisions 546 and 547.

### What Was Established

- three-wave migration strategy: shadow writes, read cutover, markdown authority removal
- operator-by-operator mapping for writers, markdown readers, and projection readers
- incremental migration order that preserves governed flows and avoids all-at-once cutover
- bounded compatibility rules for CLI stability, markdown readability, and historical tasks

### Artifact

- `.ai/decisions/20260424-548-task-operator-migration-plan.md`

## Verification

- Decision artifact exists and closes Task 548 ✅
- Operator mapping is explicit across current command surfaces ✅
- Incremental migration order is explicit and bounded ✅
- Compatibility requirements are explicit and aligned with 546/547 ✅

