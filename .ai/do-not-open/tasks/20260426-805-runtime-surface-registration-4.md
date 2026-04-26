---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:38:16.717Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:38:17.112Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 805 — Normalize runtime surface ownership and verify chapter

## Goal

Remove direct runtime-surface imports and inline command construction from main.ts, then verify and close the chapter.

## Context

This chapter is complete when sites, console, and workbench are registered surfaces rather than inline implementations.

## Required Work

1. Remove now-unused imports from main.ts.
2. Ensure main.ts invokes sites, console, and workbench registrars.
3. Run bounded help smoke checks, chapter assertion, and fast verification.
4. Commit the completed chapter.

## Non-Goals

- Do not extract principal or task leftovers in this chapter.
- Do not run long-lived servers as verification.
- Do not change command names or descriptions.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts has no direct imports of sites, console, console-server, or workbench-server command implementations.
- [x] main.ts contains no inline construction of sites, console, or workbench command groups.
- [x] Chapter 802-805 is evidence-complete.
- [x] pnpm verify passes before commit.
