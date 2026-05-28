---
status: claimed
amended_by: narada.architect
amended_at: 2026-05-16T19:46:04.221Z
---

# Integrate Telemetry Event Contract with hosted receiver

## Chapter

Site Telemetry Publication / Telemetry Event Contract

## Goal

Move the hosted receiver to the generic telemetry event contract where appropriate.

## Context

Builds on the Telemetry Event Contract package surface. This task adapts hosted receiver admission only.

## Required Work

1. Inspect the Cloudflare hosted telemetry receiver and the package/API surface from task 1395.
2. Route inbound telemetry messages through the canonical parser/validator before storage or response handling.
3. Ensure rejection responses distinguish malformed contract data from unauthorized publication capability failures.
4. Add receiver tests or worker fixtures for accepted canonical events, compatibility events, and invalid events.
5. Run the focused hosted receiver test/build command and record any deploy-only residuals without publishing.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:04.221Z: context, required work, dependencies.
- Updated the Cloudflare hosted receiver `/webhook` parser to call `validateSiteTelemetryEventContract` before projection storage or response handling.
- Accepted both current `narada.site_event.envelope.v0` compatibility events and future `narada.site_telemetry.event.v0` contract-shaped events, normalizing them to the existing projection path.
- Kept bearer capability authentication distinct from contract validation: malformed contract payloads return contract validation refusal reasons, while unauthorized publication capability failures still return token-specific refusal reasons.
- Added worker tests for future contract event acceptance and malformed/raw-value event refusal.
- Repaired a time-sensitive worker test fixture by using the current test timestamp for freshness-sensitive event defaults.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 26 tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.

## Acceptance Criteria

- [x] Hosted receiver uses the generic event contract helpers.
- [x] Existing receiver smoke/tests still pass.
- [x] Docs no longer imply SiteRegistry is the whole event contract.
