# Add scheduler posture for telemetry publisher and puller

## Chapter

Site Telemetry Publication / Telemetry Scheduler Posture

## Goal

Define and fixture scheduled operation posture for recurring telemetry publish/pull loops.

## Context

Adds scheduler posture after local publisher/puller wrappers exist. This task is
specification-and-fixture only; it does not register or create a live scheduled
task.

## Required Work

1. Read scheduler/runtime docs and the CLI wrappers from task 1410.
2. Define or implement the scheduler posture for periodic telemetry publish and pull operations, including disabled/default states.
3. Ensure scheduled work records intent/result evidence and respects capability/consent checks before transport.
4. Add tests or fixtures for disabled, due, blocked-by-capability, and successful dry-run scheduling paths.
5. Run focused scheduler tests or document why this remains specification-only.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:16.187Z: context, required work, dependencies.
- Read the local telemetry tool contract, publication outcome shape, and CLI wrapper implementation from task 1410.
- Added `docs/product/site-telemetry-scheduler-posture.v0.md` to specify recurring publish/pull loop posture, including disabled/default, due, blocked, dry-run-ready, and result states.
- Added fixtures for disabled, due, blocked-by-capability, and successful dry-run scheduling paths under `docs/product/fixtures/site-telemetry-scheduler-posture`.
- Added a Doctor summary fixture that reports freshness, failures, blocked loop count, and a read-only next action.
- Updated the local telemetry tools and outcome-shapes documents to route future live scheduler work through the admitted posture contract.

## Verification

- Parsed every JSON fixture in `docs/product/fixtures/site-telemetry-scheduler-posture`; all 5 fixtures passed.
- `git diff --check -- docs/product/site-telemetry-scheduler-posture.v0.md docs/product/site-telemetry-local-tools.v0.md docs/product/site-telemetry-publication-outcome-shapes.md docs/product/fixtures/site-telemetry-scheduler-posture` passed.
- Scheduler remains specification-and-fixture only; no live scheduled task, network transport, local inbox mutation, or remote finalization was created.

## Acceptance Criteria

- [x] Scheduler posture is specified/tested.
- [x] Doctor fixture reports freshness and failures.
- [x] No live scheduled task is created.
