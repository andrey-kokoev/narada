---
status: claimed
amended_by: narada.architect
amended_at: 2026-05-16T19:46:03.412Z
---

# Implement Telemetry Event Contract package surface

## Chapter

Site Telemetry Publication / Telemetry Event Contract

## Goal

Implement the typed event contract helpers and validation surface.

## Context

Builds on the Telemetry Event Contract spec task. This task creates the package/API surface, not hosted receiver behavior.

## Required Work

1. Read the schema/fixture specification from task 1394 and inspect existing telemetry/event package patterns.
2. Add or update the minimal package surface for Site telemetry event parsing, validation, fixture loading, and compatibility helpers.
3. Preserve existing SiteEventEnvelope compatibility unless the spec names an intentional break.
4. Add focused unit tests for valid events, invalid events, compatibility mapping, and fixture stability.
5. Run the focused package tests and typecheck/build target that covers the changed surface.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:03.412Z: context, required work, dependencies.
- Added additive `@narada2/site-config` telemetry event contract types and helpers: `SiteTelemetryEventContract`, `validateSiteTelemetryEventContract`, `parseSiteTelemetryEventFixture`, `siteTelemetryCompatibilityMap`, and `mapSiteEventEnvelopeToTelemetryEvent`.
- Preserved existing `SiteEventEnvelope` and `decideSiteEventReceiver` behavior; the new surface validates and maps without changing hosted receiver semantics.
- Added validation for required identity, Site coordinates, family/type, timestamps, auth posture, payload bounds, raw-value exclusion, non-empty authority limits, future freshness/evidence/provenance fields, and current-envelope compatibility.
- Added focused tests loading the task-1394 fixtures, validating current and future event shapes, refusing raw secret/log/DB markers, and proving explicit-only mapping from current envelopes to the future shape.

## Verification

- `pnpm --filter @narada2/site-config test` passed: 16 tests.
- `pnpm --filter @narada2/site-config typecheck` passed.
- `pnpm --filter @narada2/site-config build` passed.

## Acceptance Criteria

- [x] Typed helpers and validators exist.
- [x] Tests cover accepted/refused event fixtures.
- [x] No raw secret/log/DB payload acceptance is introduced.
