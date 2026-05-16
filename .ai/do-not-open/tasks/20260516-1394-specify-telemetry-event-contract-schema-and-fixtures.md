---
status: closed
depends_on: [1386]
amended_by: narada.builder
amended_at: 2026-05-16T19:49:49.018Z
closed_at: 2026-05-16T19:58:15.194Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Specify Telemetry Event Contract schema and fixtures

## Chapter

Site Telemetry Publication / Telemetry Event Contract

## Goal

Specify the concrete schema, fixture set, and compatibility path for Site telemetry events.

## Context

Outcome shape is docs/product/site-telemetry-publication-outcome-shapes.md, chapter Telemetry Event Contract. This is a specification task only.

## Required Work

1. Read docs/product/site-telemetry-publication.md and docs/product/site-telemetry-publication-outcome-shapes.md sections for Telemetry Event Contract.
2. Specify the canonical Site telemetry event schema, including identity, source Site coordinates, publication edge coordinates, event kind, payload envelope, timestamp/freshness, and evidence/provenance fields.
3. Define fixture files and compatibility examples that show how existing SiteEventEnvelope-shaped data maps into the new contract without silent semantic widening.
4. Document explicit non-runtime status for speculative fields and list residual implementation tasks for package/runtime adoption.
5. Run documentation/schema validation available for the touched artifacts and record any residual verification gaps.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:02.609Z: context, required work, dependencies.
- Read `docs/product/site-telemetry-publication.md`, `docs/product/site-telemetry-publication-outcome-shapes.md`, and the existing `SiteEventEnvelope` surface in `packages/site-config/src/index.ts`.
- Added `docs/product/site-telemetry-event-contract.v0.md` as the concrete specification for the event contract. It records required current fields, future-only fields, event families, compatibility mapping, fixture set, and residual implementation tasks.
- Added current-envelope, future-contract, and compatibility-map fixtures under `docs/product/fixtures/site-telemetry-event-contract/`.
- Updated `docs/product/site-telemetry-publication-outcome-shapes.md` to point at the concrete spec and refine residuals now that schema/fixture specification exists.
- No runtime package behavior was changed.

## Verification

- `node -e "const fs=require('fs'); for (const f of fs.readdirSync('docs/product/fixtures/site-telemetry-event-contract')) JSON.parse(fs.readFileSync('docs/product/fixtures/site-telemetry-event-contract/'+f,'utf8')); console.log('fixtures json ok')"` passed.
- `pnpm --filter @narada2/site-config test` passed: 13 tests.
- `pnpm --filter @narada2/site-config typecheck` passed.

## Acceptance Criteria

- [x] Schema and fixtures are specified without changing runtime behavior.
- [x] Compatibility with existing SiteEventEnvelope is explicit.
- [x] Residual implementation work is listed.
