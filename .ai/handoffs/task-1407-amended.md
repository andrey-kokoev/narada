---
status: claimed
amended_by: narada.architect
amended_at: 2026-05-16T19:46:12.946Z
---

# Align hosted message routes with Remote Candidate Exchange contract

## Chapter

Site Telemetry Publication / Remote Candidate Exchange

## Goal

Align hosted Cloudflare message exchange routes and responses with the generic
contract.

## Context

Aligns hosted message routes with Remote Candidate Exchange after task 1406.

## Required Work

1. Inspect hosted message routes in the Cloudflare telemetry surface package.
2. Adapt route request/response handling to the Remote Candidate Exchange
   envelope specified in task 1406.
3. Preserve compatibility or add explicit migration handling for existing
   telemetry message fixtures.
4. Add tests for accepted candidate, malformed candidate, duplicate replay key,
   and unauthorized candidate.
5. Run focused worker route tests/build without publishing.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:12.946Z: context, required
  work, dependencies.
- Inspected the 1406 task and Remote Candidate Exchange outcome shape. The
  detailed 1406 spec artifact was not present, so the implementation follows
  the recorded outcome family/invariants while preserving the existing hosted
  message contract fields.
- Updated hosted message submit, pending, detail, receipt, and finalize
  responses to use `narada.remote_candidate.*` schemas with generic
  `candidate` and `cloud_receipt` fields.
- Preserved compatibility with existing `message`, `receipt`, and legacy schema
  fields.
- Added `replay_key` support as the generic alias for existing
  `idempotency_key`.
- Finalize accepts the generic `narada.remote_candidate.finalize.v0` envelope
  and maps it to the existing site-inbox finalize payload.
- Added tests for accepted candidate, malformed candidate, duplicate replay key,
  unauthorized candidate, and generic finalize while preserving local admission
  authority boundaries.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 32 tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.

## Acceptance Criteria

- [x] Hosted message responses align with generic contract.
- [x] Existing tests remain green.
- [x] Local admission authority remains protected.
