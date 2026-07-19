---
status: opened
---

# Make registry read opens honest: reads never create state

## Goal

Reads never create registry state (honest open postures)

## Context

Principled site-storage resolution, stage 1 (natural cut). Proven in the incoherency sweep: openRegistryDb mkdirs and the SiteRegistry constructor runs DDL unconditionally, so read-only commands (sites registry list) create the real registry.db.

## Required Work

Thread readOnly through control-plane Database; add tryOpenRegistryDbReadOnly and openUserSiteRegistryReadOnly with ensureSchema skip; migrate site-root-resolver, site-registry-management read commands, sites-launch, and console-core to read-only opens; writers unchanged.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Read-only open against a missing path returns null and creates nothing
- [ ] Existing DB readable with mtime unchanged
- [ ] sites registry list with NARADA_USER_SITE_ROOT=temp creates no registry.db
- [ ] windows-site and cli suites plus tsc green
