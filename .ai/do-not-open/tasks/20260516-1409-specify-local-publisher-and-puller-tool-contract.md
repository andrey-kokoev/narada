---
status: closed
depends_on: [1391]
amended_by: narada.builder
amended_at: 2026-05-16T20:20:51.062Z
closed_at: 2026-05-16T20:25:17.280Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
---

# Specify Local Publisher and Puller tool contract

## Chapter

Site Telemetry Publication / Local Publisher And Puller Tools

## Goal

Specify local publisher/puller commands, inputs, outputs, and evidence.

## Context

Outcome shape is Local Publisher And Puller Tools. This is a specification task
only.

## Required Work

1. Read Local Publisher and Puller outcome shape plus existing
   CLI/operator-surface command posture docs.
2. Specify local commands or wrappers for publishing Site telemetry and pulling
   remote SiteRegistry/candidate data.
3. Define dry-run, preflight, output, error, credential-reference, and
   no-secret-logging requirements.
4. Define how commands report publication intent, transport result, and local
   admission separately.
5. Update docs only and list residual implementation tasks for CLI wrappers and
   scheduler posture.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:14.560Z: context, required
  work, dependencies.
- Added `docs/product/site-telemetry-local-tools.v0.md`.
- Specified publish/pull plan commands, run-result artifact fields, dry-run
  requirements, credential-reference posture, structured errors, output
  boundaries, and authority limits.
- Updated `docs/product/site-telemetry-publication-outcome-shapes.md` to link
  the concrete local-tools contract.

## Verification

- `git diff --check -- docs/product/site-telemetry-local-tools.v0.md docs/product/site-telemetry-publication-outcome-shapes.md` passed.

## Acceptance Criteria

- [x] Publisher/puller contracts are specified.
- [x] Dry-run and evidence posture are explicit.
- [x] Raw secret and authority boundaries are explicit.
