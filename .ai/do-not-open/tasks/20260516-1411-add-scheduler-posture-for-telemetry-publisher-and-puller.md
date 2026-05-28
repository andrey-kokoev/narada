---
status: confirmed
amended_by: narada.builder
amended_at: 2026-05-16T20:34:58.129Z
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-16T20:34:00.881Z
criteria_proof_verification:
  state: unbound
  rationale: Specification-and-fixture task verified by JSON fixture parsing and git diff whitespace checks; no live scheduled task was created.
closed_at: 2026-05-16T20:41:54.335Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
confirmed_by: narada.architect
confirmed_at: 2026-05-18T17:35:07.801Z
---

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
- Amended by narada.builder at 2026-05-16T20:34:58.129Z: dependencies
- Repaired by narada.builder2 after review: aligned scheduler command families and dry-run result schemas with the accepted local telemetry `publish plan/run` and `pull plan/run` contract from task 1410.

## Verification

- Parsed every JSON fixture in `docs/product/fixtures/site-telemetry-scheduler-posture`; all 5 fixtures passed.
- `git diff --check -- docs/product/site-telemetry-scheduler-posture.v0.md docs/product/site-telemetry-local-tools.v0.md docs/product/site-telemetry-publication-outcome-shapes.md docs/product/fixtures/site-telemetry-scheduler-posture` passed.
- Re-ran JSON fixture parsing and diff whitespace checks after the builder2 repair.
- Scheduler remains specification-and-fixture only; no live scheduled task, network transport, local inbox mutation, or remote finalization was created.

## Acceptance Criteria

- [x] Scheduler posture is specified/tested.
- [x] Doctor fixture reports freshness and failures.
- [x] No live scheduled task is created.
