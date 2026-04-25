---
status: closed
depends_on: []
amended_by: operator
amended_at: 2026-04-25T02:58:07.376Z
governed_by: task_review:a3
closed_at: 2026-04-25T03:35:36.816Z
closed_by: a3
---

# Command Run Request And Result Artifact Contract

## Goal

Specify the durable artifacts that cross into and out of CEIZ.

## Context

Narada needs a single structured representation of command execution intent before a command runs, and a single structured result after it runs. The artifacts must be rich enough for operators, agents, task evidence, telemetry, output admission, and future replay/inspection surfaces.

## Required Work

1. Define CommandRunRequest fields: run id, requester, requester kind, command argv, cwd, env policy, timeout, stdin policy, task linkage, agent linkage, expected side-effect class, approval posture, output admission profile, and requested_at.
2. Define CommandRunResult fields: run id, request id, status, exit code, signal, started_at, completed_at, duration_ms, stdout/stderr digests, stdout/stderr admitted excerpts, full-output location if retained, error class, approval outcome, and telemetry.
3. Define admissible statuses: requested, rejected, approved, running, succeeded, failed, timed_out, cancelled, blocked_by_policy.
4. Decide which fields are authoritative in SQLite and which fields are projection-only.
5. Define identity and idempotency rules for repeated requests.

## Non-Goals

Do not implement runners. Do not create a generic process executor replacement. Do not store secrets or raw unbounded output in the result row.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by operator at 2026-04-25T02:58:07.376Z: dependencies
1. Added `packages/layers/cli/src/lib/command-execution-intent.ts` with durable CEIZ request/result artifact types.
2. Defined `CommandRunRequest` fields covering requester identity, argv, cwd, env policy, timeout, stdin policy, task/agent linkage, side-effect class, approval posture, output admission profile, idempotency key, and requested timestamp.
3. Defined `CommandRunResult` fields covering lifecycle status, exit code, signal, timing, digests, admitted excerpts, retained artifact URI, error class, approval outcome, and telemetry.
4. Fixed admissible statuses as `requested`, `rejected`, `approved`, `running`, `succeeded`, `failed`, `timed_out`, `cancelled`, and `blocked_by_policy`.
5. Updated the CEIZ concept doc with SQLite ownership rules: SQLite owns identity/lifecycle/status/linkage/digests/excerpts/artifact pointers/idempotency; projections render summaries; raw unbounded output is artifact-only if retained.
6. Defined repeat-run semantics: idempotency identifies repeated requests but does not make mutating side effects safe to replay.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @narada2/cli build` | Pass |
| Manual review of `docs/concepts/command-execution-intent-zone.md` | Request/result fields, statuses, output retention, SQLite ownership, and idempotency rules present |

## Acceptance Criteria

- [x] CommandRunRequest schema is complete enough for local CLI command execution.
- [x] CommandRunResult schema is complete enough for task evidence and operator audit.
- [x] Output digest/excerpt/full-retention posture is explicit.
- [x] Idempotency and repeat-run semantics are not arbitrary.
- [x] SQLite ownership versus projection/export is explicit.



