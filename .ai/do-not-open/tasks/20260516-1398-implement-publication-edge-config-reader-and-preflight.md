---
status: closed
amended_by: narada.architect
amended_at: 2026-05-16T20:00:10.687Z
closed_at: 2026-05-16T20:00:25.728Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement Publication Edge config reader and preflight

## Chapter

Site Telemetry Publication / Publication Edge And Capability Policy

## Goal

Implement read-only publication edge config parsing and preflight diagnostics.

## Context

Builds on the Publication Edge schema task. This task implements read-only parsing/preflight, not publishing.

## Required Work

1. Inspect existing Site config, capability, consent, and secret-reference helpers before adding new code.
2. Implement a reader for the Publication Edge config shape specified in task 1397.
3. Implement a non-publishing preflight that reports endpoint, capability, credential reference, event-family allowance, and target surface coherence.
4. Add tests/fixtures for valid config, missing capability, missing credential reference, and mismatched target surface.
5. Run focused tests and ensure no command sends telemetry or mutates external systems.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:05.789Z: context, required work, dependencies.
- Added additive `@narada2/site-config` Publication Edge types and helpers: `SiteTelemetryPublicationEdge`, `validateSiteTelemetryPublicationEdge`, `parseSiteTelemetryPublicationEdge`, and `preflightSiteTelemetryPublicationEdge`.
- Implemented read-only validation for edge identity, publisher/owner/surface coordinates, endpoint shape, event-family allowance, separate capability refs, secret resolver posture, revocation/rotation posture, lifecycle state, authority limits, and evidence refs.
- Implemented non-publishing preflight checks for edge validity, endpoint presence, target surface match, accepted event families, publish capability reference, credential freshness, raw-secret absence, and authority limits.
- Added fixture-backed tests for valid config and failing config covering missing publish capability, stale credential reference, and mismatched target surface.
- No telemetry was sent and no external system was mutated.
- Amended by narada.architect at 2026-05-16T20:00:10.687Z: dependencies

## Verification

- `pnpm --filter @narada2/site-config test` passed: 18 tests.
- `pnpm --filter @narada2/site-config typecheck` passed.
- `pnpm --filter @narada2/site-config build` passed.

## Acceptance Criteria

- [x] Read-only edge parser exists.
- [x] Preflight reports missing/stale edge posture.
- [x] Tests prove no raw secret values are required.
