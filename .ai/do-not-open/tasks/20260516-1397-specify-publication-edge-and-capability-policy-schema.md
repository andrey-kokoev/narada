---
status: closed
depends_on: [1387]
amended_by: narada.builder
amended_at: 2026-05-16T19:56:39.041Z
closed_at: 2026-05-16T19:59:58.487Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Specify Publication Edge and capability policy schema

## Chapter

Site Telemetry Publication / Publication Edge And Capability Policy

## Goal

Specify publication edge records, lifecycle states, and capability policy.

## Context

Outcome shape is Publication Edge And Capability Policy. This is a specification task only.

## Required Work

1. Read the Publication Edge and capability policy sections in the Site Telemetry Publication docs.
2. Specify the durable config schema for publication edge identity, source Site, target telemetry surface, allowed event families, endpoint URL, credential reference, and rotation posture.
3. Define the local preflight checks that prove a Site is configured to publish without exposing raw secrets.
4. Define failure states for missing endpoint, missing consent/capability, stale credential reference, and mismatched target surface.
5. Update docs or schema fixtures only; list implementation residuals for reader/preflight/client helpers.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:04.985Z: context, required work, dependencies.
- Read the Site Telemetry Publication component map, authority boundary table, and Publication Edge outcome shape.
- Added `docs/product/site-telemetry-publication-edge.v0.md` with the durable edge schema, lifecycle states, local preflight checks, failure states, fixtures, and implementation residuals.
- Added valid edge, preflight pass, and preflight failure fixtures under `docs/product/fixtures/site-telemetry-publication-edge/`.
- Updated `docs/product/site-telemetry-publication-outcome-shapes.md` to link to the concrete Publication Edge spec and refine residual implementation tasks.
- No runtime behavior was changed.

## Verification

- `node -e "const fs=require('fs'); for (const f of fs.readdirSync('docs/product/fixtures/site-telemetry-publication-edge')) JSON.parse(fs.readFileSync('docs/product/fixtures/site-telemetry-publication-edge/'+f,'utf8')); console.log('publication edge fixtures json ok')"` passed.

Verification gap: no dedicated markdown/schema linter exists for this documentation-only artifact in the current package surface.

## Acceptance Criteria

- [x] Publication edge schema is specified.
- [x] Capability refs are separated from raw secrets and authority.
- [x] Lifecycle and preflight residuals are listed.
