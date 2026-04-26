---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:30:26.834Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:30:26.946Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 801 — Normalize ops-kit registrar ownership and verify chapter

## Goal

Remove direct ops-kit command imports and formatting from main.ts, then verify and close the chapter.

## Context

The chapter is complete only when main.ts treats ops-kit product/bootstrap commands as one registered surface.

## Required Work

1. Remove now-unused ops-kit imports and PosturePreset type imports from main.ts.
2. Ensure main.ts invokes a single ops-kit registrar for the product/bootstrap surface.
3. Run bounded command help smoke checks, chapter assertion, and fast verification.
4. Commit the completed chapter.

## Non-Goals

- Do not extract sites, principal, console, or workbench in this chapter.
- Do not alter ops-kit domain behavior.
- Do not run side-effecting product/bootstrap commands as verification.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts has no direct imports from @narada2/ops-kit.
- [x] main.ts contains no inline construction of init-repo, want-mailbox, want-workflow, want-posture, setup, preflight, inspect, explain, or activate.
- [x] Chapter 798-801 is evidence-complete.
- [x] pnpm verify passes before commit.
