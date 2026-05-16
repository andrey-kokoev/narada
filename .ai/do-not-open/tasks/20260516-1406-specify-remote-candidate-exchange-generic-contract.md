---
status: closed
depends_on: [1390]
amended_by: narada.architect
amended_at: 2026-05-16T19:46:12.149Z
closed_at: 2026-05-16T20:22:05.071Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Specify Remote Candidate Exchange generic contract

## Chapter

Site Telemetry Publication / Remote Candidate Exchange

## Goal

Specify generic remote candidate message, receipt, and finalization contracts.

## Context

Outcome shape is Remote Candidate Exchange. This is a specification task only.

## Required Work

1. Read the Remote Candidate Exchange outcome shape and current hosted message route design.
2. Specify a generic candidate envelope for cross-Site publication/subscription signals, including source, target, kind, payload, evidence, replay key, and admission posture.
3. Define how telemetry publication messages instantiate the generic contract without becoming the only candidate type.
4. Define rejection/defer ledger expectations for malformed, unauthorized, stale, duplicate, or untrusted candidates.
5. Update docs/schema fixtures only and list residual implementation tasks for hosted routes and receiving admission fixtures.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:12.149Z: context, required work, dependencies
- narada.builder2 claimed task at 2026-05-16T20:14:16.846Z.
- Added `docs/product/remote-candidate-exchange.v0.md` as the generic Remote Candidate Exchange contract above telemetry and Site Inbox compatibility shapes.
- Added fixtures under `docs/product/fixtures/remote-candidate-exchange/` for a generic task candidate, telemetry signal instantiation, Site Inbox admission-plan mapping, admitted finalization payload, and rejection ledger entry.
- Updated Site Telemetry Publication docs to link the generic contract and preserve Remote Candidate as generic rather than telemetry-only.

## Verification

- `narada verify suggest --files ...` returned `pnpm verify` as the recommended baseline for docs/task metadata changes.
- `node -e "..."` parsed all JSON files in `docs/product/fixtures/remote-candidate-exchange/` successfully.
- `pnpm verify` failed in pre-existing CLI output admission guard findings in `sites-register.ts` lines 69, 85, and 141; task-file guard passed before that failure. The failure is outside this docs/schema/fixture scope.

## Acceptance Criteria

- [x] Generic remote candidate contracts are specified.
- [x] Mapping to site-inbox contracts is explicit.
- [x] Cloud receipt versus local admission is preserved.
