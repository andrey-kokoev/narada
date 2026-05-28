---
status: claimed
amended_by: narada.architect
amended_at: 2026-05-16T19:46:06.573Z
---

# Wire Publication Edge policy into client helpers

## Chapter

Site Telemetry Publication / Publication Edge And Capability Policy

## Goal

Make local publish/pull helpers consume publication edge config rather than ad hoc endpoint inputs.

## Context

Builds on the Publication Edge reader/preflight task. This task wires client helper preparation, not scheduled runtime publication.

## Required Work

1. Inspect telemetry client helpers and the Publication Edge reader/preflight from task 1398.
2. Require client helper calls to resolve a named Publication Edge before preparing outbound telemetry.
3. Ensure helpers pass credential references and endpoint coordinates without logging or materializing raw secrets.
4. Add tests showing allowed event family succeeds and disallowed or incoherent edge fails before network transport.
5. Run focused client helper tests and record any residual transport integration gaps.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:06.573Z: context, required work, dependencies.
- Added additive client helpers `buildBoundedSiteEventFromPublicationEdge` and `publishBoundedSiteEventWithPublicationEdge`.
- The new helper path requires a `SiteTelemetryPublicationEdge`, runs the read-only preflight before event preparation/transport, verifies event-family allowance, uses the edge endpoint coordinate, and resolves only the publish capability reference at live transport time.
- Dry-run returns a bounded publish plan without network calls or capability resolution.
- Added tests proving allowed event family succeeds, dry-run stays network-free, disallowed family fails before network, stale credential posture fails before network, and live transport resolves the capability only when sending.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 30 tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.

## Acceptance Criteria

- [x] Client helpers can use publication edge descriptors.
- [x] Dry-run remains network-free.
- [x] Capability resolution remains transport-time only.
