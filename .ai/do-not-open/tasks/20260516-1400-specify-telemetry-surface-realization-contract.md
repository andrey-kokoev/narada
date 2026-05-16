---
status: closed
depends_on: [1388]
amended_by: narada.builder
amended_at: 2026-05-16T20:03:48.308Z
closed_at: 2026-05-16T20:26:27.523Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Specify Telemetry Surface realization contract

## Chapter

Site Telemetry Publication / Telemetry Surface Realizations

## Goal

Specify realization-neutral surface records and Cloudflare/local variants.

## Context

Outcome shape is Telemetry Surface Realizations. This is a specification task only.

## Required Work

1. Read Site Telemetry Publication outcome shape sections for Telemetry Surface realizations and the current Cloudflare materialization docs.
2. Specify Telemetry Surface as the named realization of Site Telemetry Publication, distinct from SiteRegistry and from a single Site identity.
3. Define the realization contract: deployable package, routes, storage bindings, config coordinates, readiness evidence, and local fixture realization.
4. State naming rules for narada-repo-site-registry or equivalent repo Site surface without implying all Sites live inside one Site.
5. Update docs only and list residual implementation tasks for package naming and local fixture realization.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:07.355Z: context, required work, dependencies.
- Read the Telemetry Surface Realizations outcome shape and Cloudflare Site materialization design.
- Added `docs/product/site-telemetry-surface-realization.v0.md` defining the realization-neutral contract, Cloudflare variant, local fixture variant, naming rules, non-authority posture, and residual implementation tasks.
- Added Cloudflare and local filesystem realization fixtures under `docs/product/fixtures/site-telemetry-surface-realization/`.
- Updated `docs/product/site-telemetry-publication-outcome-shapes.md` to link to the concrete realization spec and refine residual tasks.
- No runtime behavior was changed.

## Verification

- `node -e "const fs=require('fs'); for (const f of fs.readdirSync('docs/product/fixtures/site-telemetry-surface-realization')) JSON.parse(fs.readFileSync('docs/product/fixtures/site-telemetry-surface-realization/'+f,'utf8')); console.log('surface realization fixtures json ok')"` passed.

Verification gap: no dedicated markdown/schema linter exists for this documentation-only artifact in the current package surface.

## Acceptance Criteria

- [x] Realization contract is specified.
- [x] Cloudflare and non-Cloudflare variants are covered.
- [x] Deployment coordinates are explicitly non-authority.
