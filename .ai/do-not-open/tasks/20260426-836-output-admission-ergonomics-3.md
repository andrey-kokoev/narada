---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T19:54:13.416Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T19:54:13.808Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 836 — Burn down small rebuild spacing allowlist cluster

## Goal

Remove the easy rebuild-views/rebuild-projections blank-line direct output allowances by returning formatted output instead.

## Context

The guard report should identify small allowlist clusters. Rebuild spacing is a low-risk migration target because it is finite and localized.

## Required Work

1. Replace direct blank-line console.log calls in rebuild-views and rebuild-projections with formatter-backed or returned formatted output that preserves human readability.
2. Remove the corresponding allowlist entries from the guard.
3. Run affected help or bounded command smoke if safe, otherwise rely on typecheck/build and guard.

## Non-Goals

- Do not change projection rebuild semantics.
- Do not run destructive rebuild operations as verification.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] rebuild-views.ts and rebuild-projections.ts no longer appear in guard allowlist for blank-line direct output.
- [x] The output admission guard passes with a reduced allowance count.
- [x] @narada2/cli typecheck and build pass.
