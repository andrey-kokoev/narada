# Task 280: Correct Task 263 Chapter Close Semantics and Artifact Discipline

## Chapter

Multi-Agent Task Governance

## Context

Task 263 introduced chapter closure and warm-agent routing, but review found both a semantic bug and an artifact-discipline gap.

## Findings

### 1. Chapter Close Mutates Despite Non-Terminal Tasks

`chapter-close.ts` collects non-terminal tasks, but in non-dry-run mode it still:

- writes a closure artifact
- transitions `closed` tasks to `confirmed`

even when the chapter still has `in_review`, `claimed`, `opened`, `needs_continuation`, or `draft` tasks.

That makes chapter closure non-authoritative and can confirm tasks while the chapter is not actually ready to close.

### 2. Task 263 Artifact Is Incomplete

`.ai/do-not-open/tasks/20260420-263-chapter-closure-and-warm-agent-routing.md` has checked acceptance boxes but no execution notes or verification section.

That does not satisfy the standing task contract.

## Goal

Make chapter closure semantically strict and bring Task 263’s artifact up to task-discipline standard.

## Required Work

### 1. Enforce Closure Preconditions

Update `packages/layers/cli/src/commands/chapter-close.ts` so non-dry-run closure fails when any chapter task is non-terminal.

Expected behavior:

- dry-run: preview is allowed and lists non-terminal tasks
- non-dry-run: if any non-terminal tasks exist, return an error and do **not** write the artifact and do **not** transition tasks

### 2. Add Focused Tests

Add a focused test proving:

- non-dry-run `chapter close` with non-terminal tasks returns an error
- no closure artifact is written
- no task status is transitioned

Keep the existing successful close path covered as well.

### 3. Complete Task 263 Artifact

Update `.ai/do-not-open/tasks/20260420-263-chapter-closure-and-warm-agent-routing.md` with:

- execution notes describing what was implemented
- verification evidence
- any bounded deferrals

Do not leave it as checked boxes only.

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Non-Goals

- Do not redesign chapter models beyond the closure precondition.
- Do not add heartbeat/presence detection.
- Do not implement auto-closing chapters.
- Do not run broad/full test suites.
- Do not create derivative task-status files.

## Execution Notes

### 1. Enforce Closure Preconditions

Modified `packages/layers/cli/src/commands/chapter-close.ts`:
- Added non-terminal check before artifact write in non-dry-run path
- If `nonTerminal.length > 0`, returns `GENERAL_ERROR` with explicit list of blocking tasks
- Artifact write and task transitions are skipped entirely on failure
- Removed dead warning code in success path (now unreachable)

### 2. Focused Tests

Added to `packages/layers/cli/test/commands/chapter-close.test.ts`:
- "non-dry-run fails when tasks are not terminal" — verifies error, zero artifacts, no status transitions
- Existing tests still cover: dry-run preview, successful closure, review findings inclusion

### 3. Complete Task 263 Artifact

Updated `.ai/do-not-open/tasks/20260420-263-chapter-closure-and-warm-agent-routing.md` with:
- Execution notes describing implementation
- Verification evidence (typecheck + test commands)
- Corrective notes section referencing Task 280

### Verification

- `pnpm --filter @narada2/cli typecheck` — passes
- `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/chapter-close.test.ts"` — 5/5 pass

## Acceptance Criteria

- [x] Non-dry-run chapter closure fails when any chapter task is non-terminal.
- [x] Failed closure performs no artifact write and no task-status transitions.
- [x] Focused tests cover both blocked and successful closure paths.
- [x] Task 263 has proper execution notes and verification evidence.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
