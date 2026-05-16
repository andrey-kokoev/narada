---
status: closed
amended_by: narada.builder
amended_at: 2026-05-16T20:05:08.649Z
closed_at: 2026-05-16T20:26:52.436Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Refactor Cloudflare package naming/docs toward Telemetry Surface realization

## Chapter

Site Telemetry Publication / Telemetry Surface Realizations

## Goal

Align existing Cloudflare package docs and exports with telemetry surface realization language without breaking package compatibility.

## Context

Refactors Cloudflare package naming/docs after Telemetry Surface realization contract is specified.

## Required Work

1. Inspect the current Cloudflare package, wrangler config, docs, and tests created for hosted Site Registry.
2. Rename or document package-facing terminology so it presents as a Site Telemetry Surface realization, with SiteRegistry as one read model it serves.
3. Preserve existing package functionality and avoid publishing or changing Cloudflare resources.
4. Update references, README/docs, and tests that encode the old site-level naming if they would mislead operators.
5. Run focused package tests/build and record any remaining external naming residuals.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:08.159Z: context, required work, dependencies.
- Inspected the Cloudflare package README, hosted deployment runbook, package metadata, and Wrangler example.
- Updated package-facing docs to describe `@narada2/site-registry-cloudflare` as a Cloudflare Worker realization of a Site Telemetry Surface, with SiteRegistry as one read model served by that surface.
- Preserved package name, route names, import paths, and `NARADA_SITE_REGISTRY_*` binding names as explicit compatibility posture.
- Added non-authority wording for Worker name, route, domain, D1 id, KV id, and deployment values.
- No Cloudflare resources were published or changed.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 30 tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.

## Acceptance Criteria

- [x] Cloudflare package is documented as a telemetry surface realization.
- [x] Backward compatibility posture is explicit.
- [x] Tests still pass.
