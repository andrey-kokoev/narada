---
status: opened
amended_by: architect
amended_at: 2026-04-30T02:55:54.746Z
---

# Add stale CLI dist repair guidance to operator ergonomics

## Chapter

.ai/do-not-open/tasks/20260430-1105-1109-first-time-operator-ergonomics.md

## Goal

Make stale Narada CLI dist/source mismatch actionable and non-mysterious for Operators and agents during governance work.

## Context

The Narada shim can detect that the installed dist is stale relative to source and continues governance commands in permissive mode. The warning is useful but not yet ergonomic: it repeats often, does not give a clear repair command, and can confuse first-time Operators about whether governance output is trustworthy.

## Required Work

1. Locate the shim stale-dist detection path and document its current authority posture.
2. Add a compact repair recommendation that names the exact rebuild or refresh command for this repo.
3. Add or extend a bounded doctor/preflight surface that reports CLI shim source, dist freshness, package build posture, and strict/permissive governance behavior.
4. Feed this diagnosis into the first-time Operator front-door/readiness path so stale CLI state appears as an actionable readiness warning.
5. Preserve permissive behavior for read-only governance commands unless strict mode is explicitly enabled.
6. Add focused tests for clean dist, stale dist permissive mode, stale dist strict mode, missing dependency/rebuild command failure, and bounded output.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-30T02:55:54.746Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] The stale-dist warning names the exact source/dist mismatch and the safe rebuild or refresh command
- [ ] A bounded doctor/preflight surface reports CLI shim source, dist freshness, package build posture, and whether governance commands are allowed to proceed
- [ ] First-time Operator guidance includes stale-dist repair when detected
- [ ] The behavior avoids giant transcripts and does not block read-only governance commands unless strict mode is explicitly enabled
- [ ] Focused tests cover clean dist, stale dist permissive mode, stale dist strict mode, and missing rebuild dependency cases
