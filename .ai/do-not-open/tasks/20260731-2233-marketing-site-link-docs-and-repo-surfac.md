---
number: 2233
governed_by: task_close:narada.architect
status: closed
tags: docs, marketing, website
creation_payload_ref: mcp_payload:narada-mkt-site-2026-07-31-docs-links@v1
creation_payload_sha256: ecf75744a0b25a1ae251d307fd19fba943fe2e996f40dc428cd5aa7eb33e180c
idempotency_key: chapter-narada-marketing-site-2026-07-31-docs-links
execution_binding_json: {"workspace_root":"<src-root>\\narada","executor_kind":"manual","executor_profile":null,"executor_id":null,"repository_root":null,"site_root":"<src-root>\\narada","correlation_key":"chapter-narada-marketing-site-2026-07-31-docs-links"}
criteria_proved_by: andrey-user.resident
criteria_proved_at: 2026-07-31T22:51:06.528Z
closed_at: 2026-07-31T23:15:33.626Z
closed_by: narada.architect
closure_mode: agent_finish
---

# Marketing site: link docs and repo surfaces

## Goal

Point repo and product surfaces at the public marketing site once deployed.

## Context

Follows domain/deployment task in chapter narada-marketing-site. Touches README/package metadata and possibly operator console references.

## Required Work

1. Add homepage/site link to README and package.json metadata where appropriate.
2. Add link from operator console or docs where appropriate.
3. Verify links resolve.

## Non-Goals

Changing schema URI namespaces; console landing page redesign.

## Execution Notes


## Changes

1. README.md — added 'Website: [narada.systems](https://narada.systems)' directly under the title, the primary doc surface of the public repo.
2. package.json (repo root) — added homepage: https://narada.systems.
3. packages/layers/cli/package.json (@narada2/cli, the published npm package) — added homepage: https://narada.systems so the npm listing links the site.

Scope kept minimal per non-goals: no schema URI namespace changes, no operator console landing page redesign. The console/doc cross-links beyond README were judged unnecessary for this chapter iteration.

## Verification


1. node JSON.parse on both edited package.json files: JSON OK.
2. Link target https://narada.systems/ returns HTTP 200 with the real landing page (verified in task 2231 evidence and re-checked after edits).
Acceptance criteria: (a) README and metadata reference the live site — done in 3 files; (b) links verified — 200 confirmed.

## Acceptance Criteria

- [x] README and metadata reference the live site
- [x] Links verified
