---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:45:01.051Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:45:01.418Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 809 — Normalize principal surface ownership and verify chapter

## Goal

Remove direct principal command imports and inline construction from main.ts, then verify and close the chapter.

## Context

This chapter is complete when principal is one registered surface rather than an inline block.

## Required Work

1. Remove now-unused principal imports and CommandContext usage from main.ts if no longer needed.
2. Ensure main.ts invokes registerPrincipalCommands(program).
3. Run bounded principal help smoke checks, chapter assertion, and fast verification.
4. Commit the completed chapter.

## Non-Goals

- Do not extract task inspection leftovers in this chapter.
- Do not change principal command implementation internals except registration ownership.
- Do not change command names or descriptions.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts has no direct imports of principal command implementations.
- [x] main.ts contains no inline construction of the principal command group.
- [x] Chapter 806-809 is evidence-complete.
- [x] pnpm verify passes before commit.
