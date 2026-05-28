---
status: claimed
amended_by: narada.architect
amended_at: 2026-05-16T19:46:10.588Z
---

# Implement SiteRegistry read model derivation

## Chapter

Site Telemetry Publication / SiteRegistry Read Model

## Goal

Implement derivation helpers for SiteRegistry read models from telemetry events
and known-site descriptors.

## Context

Implements SiteRegistry read-model derivation from telemetry events after task
1403.

## Required Work

1. Inspect existing hosted storage/read model code and the SiteRegistry schema
   from task 1403.
2. Implement deterministic derivation from admitted telemetry events into the
   SiteRegistry read projection.
3. Preserve provenance and freshness metadata so consumers can distinguish
   current, stale, and conflicting records.
4. Add tests using the fixture inputs/outputs from task 1403.
5. Run focused read-model tests and ensure no source Site authority is mutated
   by derivation.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:10.588Z: context, required
  work, dependencies.
- Added `deriveSiteRegistryReadModel` and typed SiteRegistry read-model
  interfaces in `packages/site-config/src/index.ts`.
- The derivation groups telemetry events by subject/target/source Site,
  preserves source event refs and per-Site provenance, computes freshness from
  `generated_at`, and records locus/relation conflicts instead of resolving
  them silently.
- The read model exposes authority limits and future authority-substrate
  criteria but does not grant capability, admit inbox/task state, or mutate
  source Site authority.
- Added tests against the task 1403 fixtures plus a stale/conflicting signal
  case.

## Verification

- `pnpm --filter @narada2/site-config test` passed: 21 tests.
- `pnpm --filter @narada2/site-config typecheck` passed.
- `pnpm --filter @narada2/site-config build` passed.

## Acceptance Criteria

- [x] Read model derivation helpers exist.
- [x] Tests cover key registry states.
- [x] Read model remains projection-only.
