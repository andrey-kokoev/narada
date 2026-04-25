---
status: closed
created: 2026-04-23
closed_at: 2026-04-24T16:35:00.000Z
closed_by: codex
governed_by: task_close:codex
depends_on: [546]
artifact: .ai/decisions/20260424-547-sqlite-schema-and-projection-split.md
---

# Task 547 - SQLite Schema And Projection Split

## Goal

Define the SQLite schema and task projection model so lifecycle authority can move into SQLite without duplicating the same authoritative data in markdown.

## Required Work

1. Define the minimum SQLite schema for authoritative task lifecycle state.
2. Define how markdown task files survive:
   - authored spec only,
   - compiled merged view,
   - or split-file model.
3. Specify the projection/read model that combines SQLite lifecycle state with markdown-authored spec without double authority.
4. State the migration posture for git-readable diffs and human inspection.
5. Write the schema/projection artifact to `.ai/decisions/`.

## Acceptance Criteria

- [x] Schema/projection artifact exists.
- [x] SQLite schema is explicit.
- [x] Projection model is explicit.
- [x] Anti-duplication rule is preserved.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Scope

Executed the schema/projection definition directly from the authority boundary in Decision 546 and aligned it with the already-written anti-duplication enforcement in Decision 549.

### What Was Established

- minimum SQLite schema for lifecycle, assignments, reports, reviews, and task number sequence
- Model A survival posture: markdown remains authored spec only
- read-only merged projection shape combining SQLite lifecycle state with markdown-authored body sections
- projection rules that preserve single authority and forbid lifecycle write-back into markdown

### Artifact

- `.ai/decisions/20260424-547-sqlite-schema-and-projection-split.md`

## Verification

- Decision artifact exists and closes Task 547 ✅
- SQLite schema is explicit with table-level purpose and field ownership ✅
- Projection model is explicit and read-only ✅
- Anti-duplication posture from Decision 546 is preserved via Model A ✅

