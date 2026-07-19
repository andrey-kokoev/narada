---
status: opened
depends_on: [2153]
---

# Introduce explicit site storage context with provenance; flip mutation default

## Goal

Resolution requires an explicit storage context; production is never the ambient default for mutations

## Context

Principled site-storage resolution, stage 3 (principled core). SiteStorageContext with kind production/ephemeral and source explicit/ambient_env; provenance on every resolution; staged default flip behind NARADA_STORAGE_REQUIRE_EXPLICIT.

## Required Work

Add SiteStorageContext and resolveSiteStorageContext; thread context and provenance through resolvers and open helpers; CLI command-wrapper and daemon entry points construct explicit production context; add NARADA_STORAGE_REQUIRE_EXPLICIT refuse-ambient-on-mutation, then flip to default after consumers migrate; mcp-surfaces harness asserts provenance.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Ambient mutation under the flag refuses with an actionable error
- [ ] Explicit production and ephemeral contexts succeed
- [ ] Back-compat suites green before the flip commit
