---
status: closed
closed_at: 2026-05-15T19:21:09.231Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# CAPA: Review reports submitted with placeholder task evidence

## Chapter

Canonical Inbox Promotions

## Goal

Correct and prevent task reports from creating review obligations when task evidence remains placeholder or acceptance criteria are unchecked.

## Context

Source inbox envelope: env_6112c84b-de87-4187-978e-35a7021b4412

Source: agent_report:codex_session:2026-05-15:stale-review-report-evidence

Envelope kind: incident

Summary: Builder review encountered repeated in-review tasks whose reports existed but task evidence remained incomplete: acceptance criteria unchecked and execution notes or verification still scaffold placeholders.

Recommendation: Promote to a Narada proper CAPA task for report-admission evidence completeness hardening.

## Required Work

0. Source summary: Builder review encountered repeated in-review tasks whose reports existed but task evidence remained incomplete: acceptance criteria unchecked and execution notes or verification still scaffold placeholders.
1. Read source inbox envelope env_6112c84b-de87-4187-978e-35a7021b4412 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Identified Narada proper task-report admission as the smallest preventive boundary: report creation, lifecycle transition, and directed review obligation creation all pass through `packages/task-governance/src/task-report-service.ts`.
- Added a pre-mutation evidence completeness guard that refuses task report admission when the task projection still has unchecked Acceptance Criteria checklist items or scaffold placeholder text in Execution Notes or Verification.
- Kept the existing compatibility behavior for older minimal tasks that have no evidence sections yet: missing Execution Notes and Verification sections are still scaffolded by report submission, but explicit scaffold placeholders and unchecked criteria now block clean review-obligation creation.
- Added focused CLI regression coverage in `packages/layers/cli/test/commands/task-report.test.ts` proving incomplete task evidence is surfaced before any report record or open review obligation is created.
- Rebuilt `@narada2/task-governance` so the CLI package export uses the updated service implementation.
- Checked originating tasks: 1270 and 1271 are still `in_review` after repaired evidence and new reports; 1267 closed only after repaired evidence was supplied, accepted by Builder review, and closed through governed task close.

## Verification

- `pnpm --filter @narada2/task-governance build` passed.
- Initial `pnpm --filter @narada2/cli test -- task-report.test.ts` failed before rebuild because the CLI imports `@narada2/task-governance` through `dist`; this verified the test was exercising the package export rather than the edited TypeScript source.
- `pnpm --filter @narada2/cli test -- task-report.test.ts` passed after rebuild with 25 tests.
- `narada task read 1270 --format json --verbose` showed task 1270 is `in_review`, has execution notes, verification, a report, a review record, and all criteria checked.
- `narada task read 1271 --format json --verbose` showed task 1271 is `in_review`, has execution notes, verification, a report, a review record, and all criteria checked.
- `narada task read 1267 --format json --verbose` showed task 1267 is `closed` only after repaired evidence, an accepted Builder review, and governed close evidence.

## Acceptance Criteria

- [x] Report admission or review work-next surfaces incomplete task evidence before a clean review obligation is treated as ready.
- [x] Regression coverage exercises report submission or review selection with unchecked criteria and scaffold evidence.
- [x] Tasks 1270, 1267, and 1271 remain open until repaired evidence is supplied and reviewed.
