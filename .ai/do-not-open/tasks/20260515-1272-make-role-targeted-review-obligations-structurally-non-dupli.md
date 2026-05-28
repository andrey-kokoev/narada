---
status: closed
amended_by: narada.architect
amended_at: 2026-05-15T17:22:08.044Z
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-15T17:22:15.598Z
criteria_proof_verification:
  state: unbound
  rationale: Task 1272 criteria are proven by the schema/store changes, role-target report routing changes, repair audits, focused task-report regression tests, typechecks, builds, and live directed-obligation probe.
closed_at: 2026-05-15T18:11:08.123Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Make role-targeted review obligations structurally non-duplicative

## Goal

Make pure role-targeted directed obligations use target_role without duplicating the role in target_ref.

## Context

Operator noted that target_role=builder and target_ref=role:builder duplicate information. The routing shape should make that impossible in Narada proper.

## Required Work

Change the directed obligation store/schema so role-targeted obligations can have null target_ref; normalize legacy role:<role> refs to null; add a schema-level guard that rejects role:<target_role> duplication; repair current open role-targeted review obligations; add focused regression coverage.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Changed the directed obligation schema/store so pure role targets are represented as `target_agent_id=null`, `target_role=<role>`, and `target_ref=null`, with a schema guard rejecting `target_ref = role:<target_role>`.

Extended report/review-request routing so role names used as review targets produce role-targeted obligations rather than resolving to a specific reviewer identity. Exact agent ids still remain identity-targeted.

Repaired live builder review obligations, including the post-report 1267 obligation created before the role-alias fix, so current open builder review obligations are role-targeted without duplicate `target_ref`.

Recorded repair evidence in `.narada/audit/task-1272-role-target-ref-structural-repair.json` and `.narada/audit/20260515-task-1267-review-role-retarget-repair.json`.

## Verification

- `pnpm --filter @narada2/task-governance typecheck` passed.
- `pnpm --filter @narada2/task-governance build` passed.
- `pnpm --filter @narada2/cli typecheck` passed.
- `pnpm --filter @narada2/cli build` passed.
- `pnpm --filter @narada2/cli test -- task-report.test.ts` passed with 24 tests.
- Live directed obligation probe confirmed open tasks 1267, 1272, and 1280 have `target_agent_id=null`, `target_role=builder`, and `target_ref=null`.
- `narada work-next --agent narada.builder --peek --format json` selected a role-targeted Builder review obligation with `target_agent_id=null` and `target_ref=null`.

## Acceptance Criteria

- [x] DirectedObligationRow target_ref is nullable.
- [x] The directed_obligations SQLite schema permits null target_ref and rejects target_ref = role:<target_role>.
- [x] Store upsert normalizes role-targeted target_ref=role:<role> to null.
- [x] Current builder role-targeted review obligations have target_ref null.
- [x] Focused tests and builds pass.
