---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:22:42.710Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:22:42.822Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 795 — Extract draft inspection command registration

## Goal

Move drafts and show-draft command construction out of main.ts into the outbound action registrar while preserving bounded inspection behavior.

## Context

Draft inspection belongs with outbound operator-action surfaces and should not remain directly embedded in main.ts.

## Required Work

1. Move drafts and show-draft Commander construction into the outbound action registrar.
2. Preserve limit parsing, arguments, options, defaults, and output format propagation.
3. Keep drafts bounded by the existing default limit.
4. Update main.ts so it only invokes the registrar.

## Non-Goals

- Do not broaden default draft listing output.
- Do not change draft grouping logic.
- Do not execute live send behavior.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs drafts or show-draft.
- [x] The registrar owns draft inspection registration.
- [x] Bounded help smoke checks confirm both commands remain available.
- [x] Typecheck/build succeeds.
