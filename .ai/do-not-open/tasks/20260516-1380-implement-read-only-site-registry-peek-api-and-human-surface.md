---
status: closed
depends_on: [1379]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T16:32:24.907Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-16T16:32:25.343Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Implement read-only Site Registry peek API and human surface

## Chapter

Cloudflare hosted Site Registry projection

## Goal

Expose bounded read-only API and minimal human peek surface for hosted Site Registry projections.

## Context

Staccato serves a root UI shell and guarded read APIs for dashboard, reports, inbox messages, and receipts. Narada needs read-only projection access such as GET /, GET /api/sites, GET /api/projections/:site_id, and health/freshness surfaces without mutation authority.

## Required Work

1. Implement read-only routes for registry summary, per-Site projection, freshness, and Worker health. 2. Implement a minimal human peek page that reads projection APIs and does not embed raw evidence payloads. 3. Require read capability where appropriate, with no bearer token stored in repo or response bodies. 4. Include no-authority fields in API responses: projection_only, mutates_site=false, admits_inbox=false, mutates_task_lifecycle=false, grants_capability=false. 5. Add tests for JSON and HTML routes, freshness classification, bounded output, and redaction.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Implemented bounded read routes in `packages/site-registry-cloudflare`: public `GET /api/sites` registry summary, public `GET /api/freshness` freshness summary, and read-token protected `GET /api/projections/:site_id` per-Site projection detail. Responses include explicit no-authority fields and do not expose raw event payload records or bearer token values.

Updated the human peek page to load the summary API from the browser without embedding evidence payloads or credentials. Updated package docs to distinguish public summary/freshness from protected per-Site detail.

Expanded tests to cover JSON and HTML routes, freshness classification, redaction, read-token enforcement, and no-authority response posture.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 1 test file, 12 tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.

## Acceptance Criteria

- [x] Read APIs expose Site projection posture, freshness, and provenance through bounded responses.
- [x] Human peek UI is usable as a read-only projection surface.
- [x] Tests prove routes do not mutate Site state, task lifecycle, inbox admission, identity, or capability grants.
