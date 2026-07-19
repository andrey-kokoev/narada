---
status: opened
depends_on: [2154]
---

# Guard registry writes against temp-dir site roots without ephemeral context

## Goal

Registry mutations refuse temp-dir site roots unless the registry was opened with an ephemeral context

## Context

Principled site-storage resolution, stage 4 (defense in depth). With storage context carried on the SiteRegistry instance, temp-root guard is cheap.

## Required Work

SiteRegistry carries its open context; mutation methods refuse a site_root under the OS temp dir unless context kind is ephemeral; unit tests in registry.test.ts.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Temp-root mutation refused in production context and allowed in ephemeral context
- [ ] registry.test.ts green
