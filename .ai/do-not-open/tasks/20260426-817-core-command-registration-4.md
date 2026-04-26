---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T05:08:42.109Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T05:08:42.465Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 817 — Normalize main composition and verify chapter

## Goal

Remove direct singleton command imports and inline construction from main.ts, then verify and close the chapter.

## Context

This chapter is complete when main.ts is reduced to global setup, task root creation, registrar calls, and parse.

## Required Work

1. Remove now-unused imports from main.ts.
2. Ensure main.ts invokes the new registrars.
3. Run bounded help smoke checks, chapter assertion, and fast verification.
4. Commit the completed chapter.

## Non-Goals

- Do not extract already-registered surfaces.
- Do not alter command behavior beyond registration ownership.
- Do not run side-effecting commands as verification.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts has no direct imports of the extracted singleton command implementations.
- [x] main.ts contains no inline construction of the extracted commands.
- [x] Chapter 814-817 is evidence-complete.
- [x] pnpm verify passes before commit.
