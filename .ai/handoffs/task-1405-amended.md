---
status: claimed
amended_by: narada.architect
amended_at: 2026-05-16T19:46:11.366Z
---

# Integrate SiteRegistry read model with User Site awareness posture

## Chapter

Site Telemetry Publication / SiteRegistry Read Model

## Goal

Define and test how SiteRegistry projections relate to User Site awareness
without ownership collapse.

## Context

Integrates SiteRegistry read-model output with User Site awareness posture after
derivation exists.

## Required Work

1. Read User Site awareness registry docs and inspect current awareness/read
   surfaces.
2. Define or implement the adapter boundary by which a User Site consumes remote
   SiteRegistry output as advisory awareness, not ownership.
3. Add fixture or doc examples for a user Site observing multiple project/client
   Sites through telemetry surfaces.
4. Ensure stale/conflicting remote records are represented as awareness posture
   rather than local mutation truth.
5. Run focused tests or docs validation and record any residual runtime
   integration work.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:11.366Z: context, required
  work, dependencies.
- Added `deriveUserSiteAwarenessFromRegistryReadModel` and typed advisory
  awareness interfaces in `packages/site-config/src/index.ts`.
- The adapter converts remote SiteRegistry read-model entries into User Site
  awareness entries with route candidates, freshness/conflict posture,
  provenance, visible capabilities, denied authority, and explicit advisory
  limits.
- Added fixtures covering `narada-proper` and `staccato-client-service` as
  multiple observed publisher Sites, including a stale/conflicting client Site
  record.
- Updated `docs/product/user-site-awareness-registry.md` with the consumption
  boundary and fixture links.

## Verification

- `node -e "const fs=require('fs'); for (const dir of ['docs/product/fixtures/user-site-awareness-from-registry']) for (const f of fs.readdirSync(dir)) JSON.parse(fs.readFileSync(dir+'/'+f,'utf8')); console.log('user site awareness fixtures json ok')"` passed.
- `pnpm --filter @narada2/site-config test` passed: 22 tests.
- `pnpm --filter @narada2/site-config typecheck` passed.
- `pnpm --filter @narada2/site-config build` passed.

## Acceptance Criteria

- [x] Integration mapping is documented or tested.
- [x] Fixture covers multiple publisher Sites.
- [x] Authority non-collapse is asserted.
