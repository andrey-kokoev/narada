---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T05:00:21.668Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T05:00:22.041Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 813 — Normalize task operations ownership and verify chapter

## Goal

Remove direct task operation imports and inline construction from main.ts, then verify and close the chapter.

## Context

This chapter is complete when task operations are a registered surface rather than inline command construction.

## Required Work

1. Remove now-unused imports from main.ts.
2. Ensure main.ts invokes registerTaskOperationsCommands(taskCmd).
3. Run bounded task operation help smoke checks, chapter assertion, and fast verification.
4. Commit the completed chapter.

## Non-Goals

- Do not extract task lifecycle/authoring/roster/evidence/dispatch registrars already extracted.
- Do not change command names or descriptions.
- Do not perform mutating next-task actions during verification.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts has no direct imports of task recommend, derive-from-finding, lint, list, search, read, graph, or task-next command implementations.
- [x] main.ts contains no inline construction of those task operation commands.
- [x] Chapter 810-813 is evidence-complete.
- [x] pnpm verify passes before commit.
