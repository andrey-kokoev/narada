---
status: closed
amended_by: narada.architect
amended_at: 2026-05-18T17:40:28.207Z
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-18T17:40:44.031Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T17:49:50.803Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Fix stale architect review obligations for terminal tasks

## Chapter

MCP Materialized Admissions

## Goal

Fix stale architect review obligations for terminal tasks

## Context

Materialized from MCP-admitted task candidate local-stale-review-obligation-projection-20260518.

Source Site: narada-proper

Source ref: operator:2026-05-18-stale-review-obligation-projection

Received at: 2026-05-18T17:35:59.690Z

Summary:
Repair workboard/my_review_obligations so review obligations targeting narada.architect do not remain actionable after the underlying task is closed or confirmed with accepted review/closure evidence. Verify with focused CLI/task-governance tests and lifecycle readback.

Evidence refs:
- narada task workboard --agent narada.architect --view compact --format json
- operator:2026-05-18-stale-review-obligation-projection
- packages/layers/cli/src/commands/work-next.ts
- packages/task-governance/src/task-review-service.ts

## Required Work

1. Preserve MCP admission context from candidate local-stale-review-obligation-projection-20260518.
2. Execute the work described by the materialized title and summary under the governed Narada task lifecycle.
3. Verify the result with focused evidence appropriate to the changed surface.
4. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Updated `packages/layers/cli/src/commands/task-workboard.ts` so directed review obligations are no longer surfaced in `my_review_obligations` when their referenced task lifecycle is terminal (`closed` or `confirmed`).
- Added a focused regression test in `packages/layers/cli/test/commands/task-workboard.test.ts` proving an open review obligation against a confirmed task does not appear as actionable architect work.
- Isolated `NARADA_AGENT_ID` in the workboard command test setup so local role environment does not change expected compact workboard command output.

## Verification

- `pnpm --dir packages/layers/cli test -- test/commands/task-workboard.test.ts` passed 6 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- `narada task workboard --agent narada.architect --view compact --format json` reported `counts.my_review_obligations: 0` and an empty `my_review_obligations` list.

## Acceptance Criteria

- [x] MCP admission local-stale-review-obligation-projection-20260518 is represented as a governed Narada task.
- [x] The materialized task is visible through canonical task lifecycle/work-next surfaces.
