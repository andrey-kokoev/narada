---
status: opened
depends_on: [2152]
---

# Unify registry loci: one resolver module, complete override coverage

## Goal

One resolver module owns registry path resolution; every locus honors the user-site override

## Context

Principled site-storage resolution, stage 2. Legacy resolveRegistryDbPath ignores NARADA_USER_SITE_ROOT; console-core reads the legacy locus so the operator console shows the stale Jul-10 catalog while the CLI reads the user-locus DB.

## Required Work

Extract resolveUserSiteRoot; make legacy resolveRegistryDbPath honor NARADA_USER_SITE_ROOT; migrate console-core to resolveRegistryDbPathByLocus; continuity-sync script imports the package resolver; add resolveSiteStorageRoots single answer; document the two storage classes.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Console registry view and CLI list show the same catalog
- [ ] Override coverage unit tests for legacy and ByLocus resolvers
- [ ] windows-site and cli suites plus tsc green
