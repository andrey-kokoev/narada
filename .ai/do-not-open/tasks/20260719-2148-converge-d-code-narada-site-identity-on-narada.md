---
status: opened
---

# Converge D:/code/narada site identity on narada

## Goal

Make narada the canonical site id for the D:/code/narada site

## Context

first-time-user-flow incoherency sweep, slice 4. Launch records said narada (explicit Site), config.json declared narada-proper, site registry row was narada-proper. Operator decision: narada canonical.

## Required Work

Set config.json site_id and mcp --site-id arg to narada (keep locus and server key); retire+purge the narada-proper registry row; add narada row with alias narada-proper.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] config.json declares site_id narada
- [ ] sites registry list shows active narada with alias narada-proper, no narada-proper row
- [ ] tsc and focused vitest suites green

## Notes

Fabric-layout context (2026-07-19, incoherency sweep): three fabric layouts coexist across sites — per-surface files at repo-root `.ai/mcp/`, per-surface under `.narada/`, and single aggregate `<site>-mcp.json`. Loader resolution order (`resolveSiteFabricPaths`, `packages/mcp-loader-mcp/src/main.ts` ~lines 1103-1126): `config.json` > `<siteBase>-mcp.json` > per-surface scan. Site-id convergence must keep the chosen layout's resolution path intact; a retired `config.json` stub shadows the aggregate fabric (feedback sfb_6d4c7019-596).
