---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T04:44:36.054Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777610660860_jbr3im
closed_at: 2026-05-01T04:45:24.000Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Invert CLI shim freshness into embodiment readiness state

## Chapter

authority-inversion-capa

## Goal

Replace stale-dist command failures with an explicit delegated CLI embodiment readiness state machine.

## Context

Authority-inversion observation env_6ac5f35a-a31d-48b1-892f-437393c12857 identifies CLI shim freshness as the missing inversion: source/dist mismatch currently appears as a command failure or warning, but the deeper structure is delegated CLI embodiment readiness.

## Required Work

Define a CLI embodiment readiness state machine for narada shim execution; model source_fresh, source_changed_dist_stale, rebuild_required, auto_build_admitted, blocked_by_active_work, and ready states; route governance commands through this readiness posture; provide exact repair/build commands; ensure active Builder work is not silently overwritten by auto-build; add tests and docs.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Shim freshness is exposed as readiness state, not only warning text or command failure.
- [x] Commands distinguish read-only doctrine/task inspection, authority-affecting governance commands, and implementation/test commands under stale-dist conditions.
- [x] Auto-build is admitted only under explicit policy and does not smear over active Builder work.
- [x] Output includes exact repair command such as pnpm --filter @narada2/cli build when rebuild is required.
- [x] Tests cover source fresh, dist stale blocked, dist stale allowed for read-only, auto-build admitted, and active-work protection.
- [x] Documentation links this to Authority-Revealing Inversion and Plural Embodiment, Singular Authority.
