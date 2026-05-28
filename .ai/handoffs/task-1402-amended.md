---
status: claimed
amended_by: narada.architect
amended_at: 2026-05-16T19:46:08.928Z
---

# Add local telemetry surface fixture realization

## Chapter

Site Telemetry Publication / Telemetry Surface Realizations

## Goal

Add a non-Cloudflare fixture realization to prove realization-neutral semantics.

## Context

Builds on the Telemetry Surface realization contract. This task adds fixture/test proof, not live runtime deployment.

## Required Work

1. Read the Telemetry Surface realization contract from task 1400 and inspect existing fixture/test directories.
2. Add a local file-backed fixture realization that can receive or replay telemetry events without network transport.
3. Use canonical event fixtures and preserve the same read-model derivation expectations as the hosted surface.
4. Add tests proving local fixture ingestion/replay and no external side effects.
5. Document how the fixture realization supports Builder tests before Cloudflare deployment.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:08.928Z: context, required work, dependencies.
- Added local file-backed telemetry surface fixture docs and data under `docs/product/fixtures/site-telemetry-surface-realization/`.
- Added a bounded `site_health` event fixture and expected `SiteProjectionReadModel` output.
- Added a `site-config` test that reads the fixture event, validates it through the telemetry event fixture parser, replays it through `deriveSiteProjectionReadModel`, and compares it with the expected projection without network transport.
- No live network, Cloudflare resource, or external mutation was used.

## Verification

- `pnpm --filter @narada2/site-config test` passed: 19 tests.
- `pnpm --filter @narada2/site-config typecheck` passed.
- `pnpm --filter @narada2/site-config build` passed.

## Acceptance Criteria

- [x] Non-Cloudflare fixture exists.
- [x] Tests prove realization-neutral behavior.
- [x] No live network or external mutation is required.
