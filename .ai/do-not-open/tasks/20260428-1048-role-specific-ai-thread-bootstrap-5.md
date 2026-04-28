---
status: closed
depends_on: [1047]
criteria_proved_by: builder
criteria_proved_at: 2026-04-28T23:21:11.582Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests now cover generated Architect and Builder sections, governance agent_role_contracts for exactly architect and builder, read-only role-bootstrap command output for both roles, rejection of unknown roles, and no generated inspector/superintendent role admission. Focused tests and pnpm verify passed after lifecycle export.
closed_at: 2026-04-28T23:21:20.458Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1048 — Verify role bootstrap doctrine, generation, and CLI surface

## Goal

Add focused tests and evidence for the role-specific AI thread bootstrap chapter.

## Context

The role split should not remain prose-only. Tests should prove that Site bootstrap emits both role contracts, governance coordinates expose the role shape, and the CLI inspection surface is bounded and rejects non-admitted roles.

## Required Work

1. Add or update focused tests for generated AGENTS.md role sections in relevant Site bootstrap paths.
2. Add or update tests for Site governance role contract shape if implemented.
3. Add tests for role bootstrap CLI output for architect and builder and rejection of unadmitted roles.
4. Run focused tests plus pnpm verify after exporting lifecycle snapshot.
5. Record residuals if full verification is blocked by unrelated dirty work.

## Non-Goals

- Do not expand the role set
- Do not test speculative future roles

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Focused tests cover Architect and Builder generated bootstrap sections
- [x] Focused tests cover the read-only bootstrap command for both roles and unknown-role rejection
- [x] pnpm verify passes or any blocker is recorded with exact unrelated cause
- [x] Chapter tasks are evidence-complete before closure
