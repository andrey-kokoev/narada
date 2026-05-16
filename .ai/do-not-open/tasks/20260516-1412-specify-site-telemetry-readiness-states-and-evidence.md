---
status: closed
depends_on: [1392]
amended_by: narada.architect
amended_at: 2026-05-16T19:46:16.976Z
closed_at: 2026-05-16T20:34:55.839Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
---

# Specify Site Telemetry readiness states and evidence

## Chapter

Site Telemetry Publication / Readiness And Operations

## Goal

Specify readiness state machine and required evidence artifacts.

## Context

Outcome shape is Readiness And Operations. This is a specification task only.

## Required Work

1. Read readiness/operations outcome shape and Cloudflare Site materialization docs.
2. Specify readiness states for Site Telemetry Publication from unconfigured through locally validated, hosted deployed, receiving, publishing, and operationally monitored.
3. Define evidence required for each state, including config, tests, deployment verification, route health, storage binding, and credential rotation posture.
4. Define commands or reports that should expose readiness without mutating deployment state.
5. Update docs only and list residual implementation tasks for deploy verifier and monitoring/rotation posture.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:16.976Z: context, required work, dependencies
- Added `docs/product/site-telemetry-readiness.v0.md`.
- Specified readiness states from `unconfigured` through `live_deployed`,
  including distinct `smoke_ready`, `hosted_deployed`, `receiving_verified`,
  `publishing_verified`, and `operationally_monitored` states.
- Defined required evidence for contracts, local validation, non-live smoke,
  deploy capability, route health, storage bindings, secret rotation, monitoring,
  and rollback posture.
- Defined read-only readiness report/doctor/explain surfaces that must not
  deploy, migrate, rotate secrets, publish telemetry, poll candidates, finalize
  receipts, or mutate local inbox/task state.
- Updated `docs/product/site-telemetry-publication-outcome-shapes.md` to link
  the concrete readiness spec and expand readiness verdicts.

## Verification

- `narada verify suggest --files ...` returned `pnpm verify` as the recommended
  baseline for docs/task metadata changes.
- `git diff --check -- docs/product/site-telemetry-readiness.v0.md
  docs/product/site-telemetry-publication-outcome-shapes.md
  .ai/do-not-open/tasks/20260516-1412-specify-site-telemetry-readiness-states-and-evidence.md`
  passed.
- `pnpm verify` failed in pre-existing CLI output admission guard findings in
  `sites-register.ts` lines 69, 85, and 141; task-file guard passed before that
  failure. The failure is outside this docs-only task scope.

## Acceptance Criteria

- [x] Readiness state machine is specified.
- [x] Evidence requirements are explicit.
- [x] Smoke-ready and live-deployed are distinct.
