---
status: opened
---

# Purge fixture-site registry row and isolate site-fabric e2e registry

## Goal

Remove e2e pollution from the real user registry and prevent recurrence

## Context

first-time-user-flow incoherency sweep, slice 3. The mcp-surfaces site-fabric e2e suite spawned servers with NARADA_USER_SITE_ROOT unset, so registry resolution fell through to the real C:/Users/Andrey/Narada/registry.db and wrote a fixture-site row on 2026-07-13.

## Required Work

Retire+purge the fixture-site row via narada sites registry; add site-fabric isolation helpers to the shared mcp-e2e-harness and wire all 25 e2e tests through them; seed the site-registry e2e fixture inside the isolated registry; assert the real registry is untouched.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] sites registry list shows no fixture-site row
- [ ] site-fabric e2e suites pass with NARADA_USER_SITE_ROOT isolated into the temp root
- [ ] real registry.db byte/mtime-identical after e2e runs
