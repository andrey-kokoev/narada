---
status: opened
---

# Make declared site identity canonical in launch registry inference

## Goal

andrey-user is canonical for the User Site root: inferSiteId must honor config.json static_config.site_id instead of inferring the site id from the directory name, while keeping explicit Site fields authoritative.

## Context

<!-- Context placeholder -->

## Required Work

1. Read static_config.site_id in siteIdFromSiteRoot. 2. Reorder inferSiteId precedence: explicit Site field, then declared config id, then directory-name inference. 3. Add site-root-resolver precedence tests. 4. Verify a live dry-run plan canonicalizes andrey-user.resident to site andrey-user.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] dry-run launch plan for andrey-user.resident shows canonical site andrey-user
- [ ] explicit Site fields still win over config declarations
- [ ] focused vitest and tsc pass
