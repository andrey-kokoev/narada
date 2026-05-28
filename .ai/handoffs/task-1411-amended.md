---
status: claimed
amended_by: narada.builder
amended_at: 2026-05-16T21:20:00.000Z
---

# Add scheduler posture for telemetry publisher and puller

## Chapter

Site Telemetry Publication / Telemetry Scheduler Posture

## Goal

Define scheduled operation posture for recurring telemetry publish/pull loops
without creating a live scheduled task.

## Execution Notes

- Read task 1411, the local telemetry tool contract, the publication outcome
  shape, and the CLI wrapper implementation from task 1410.
- Added `site-telemetry-scheduler-posture.v0.md` to specify disabled/default,
  due, blocked, dry-run-ready, and result-posture states for recurring
  telemetry loops.
- Added fixture posture examples for disabled, due, blocked-by-capability, and
  successful dry-run scheduling paths.
- Added a Doctor summary fixture that reports freshness, stale capability
  failure, blocked loop count, and read-only next action.
- Updated the local telemetry tools and outcome-shapes documents to point at
  the scheduler posture contract as the admitted predecessor to any live
  scheduler implementation.

## Verification

- Parsed every JSON fixture in
  `docs/product/fixtures/site-telemetry-scheduler-posture`.
- `git diff --check -- docs/product/site-telemetry-scheduler-posture.v0.md docs/product/site-telemetry-local-tools.v0.md docs/product/site-telemetry-publication-outcome-shapes.md docs/product/fixtures/site-telemetry-scheduler-posture`
  passed.

## Acceptance Criteria

- [x] Scheduler posture is specified/tested.
- [x] Doctor fixture reports freshness and failures.
- [x] No live scheduled task is created.
