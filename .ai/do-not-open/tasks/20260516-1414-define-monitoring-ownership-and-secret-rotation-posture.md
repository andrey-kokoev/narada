---
status: closed
amended_by: narada.architect
amended_at: 2026-05-16T19:46:18.713Z
closed_at: 2026-05-16T20:37:41.270Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
---

# Define monitoring ownership and secret rotation posture

## Chapter

Site Telemetry Publication / Readiness And Operations

## Goal

Define operational ownership, monitoring, alerting, and secret rotation posture for telemetry surfaces.

## Context

Defines operational ownership for telemetry monitoring and secret rotation after readiness states are specified.

## Required Work

1. Read readiness states from task 1412 and capability-governed secret management docs.
2. Define who owns hosted telemetry monitoring, route health checks, alert intake, and credential rotation for repo and user Sites.
3. Specify evidence records for credential reference rotation without exposing raw secrets.
4. Add docs or fixtures for operational handoff between Narada proper, User Site, and Cloudflare dashboard authority.
5. Record residual implementation tasks for any missing monitoring command surfaces.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:18.713Z: context, required work, dependencies
- Added `docs/product/site-telemetry-operations-posture.v0.md`.
- Defined monitoring, alert intake, rotation, rollback, and operational handoff
  roles across owning Site, publisher Site, receiving Site, Cloudflare dashboard
  authority, monitoring owner, and rotation owner.
- Specified `site_telemetry_monitoring_check.v0`,
  `site_telemetry_secret_rotation_evidence.v0`, and rollback plan evidence
  fields without raw secret values.
- Added
  `docs/product/fixtures/site-telemetry-operations-posture/monitoring-rotation-handoff.valid.json`
  showing Narada proper, User Site, and Cloudflare dashboard boundaries.
- Linked the operations posture from readiness and outcome-shape docs.

## Verification

- `node -e "JSON.parse(...monitoring-rotation-handoff.valid.json...)"` passed.
- `git diff --check -- docs/product/site-telemetry-operations-posture.v0.md
  docs/product/site-telemetry-readiness.v0.md
  docs/product/site-telemetry-publication-outcome-shapes.md
  docs/product/fixtures/site-telemetry-operations-posture/monitoring-rotation-handoff.valid.json
  .ai/do-not-open/tasks/20260516-1414-define-monitoring-ownership-and-secret-rotation-posture.md`
  passed.
- `narada verify suggest --files ...` returned `pnpm verify` as the recommended
  baseline for docs/task metadata changes.
- `pnpm verify` failed in pre-existing CLI output admission guard findings in
  `sites-register.ts` lines 69, 85, and 141; task-file guard passed before that
  failure. The failure is outside this docs/fixture task scope.

## Acceptance Criteria

- [x] Monitoring and ownership posture is documented.
- [x] Secret rotation evidence is specified without raw values.
- [x] Rollback expectations remain governed.
