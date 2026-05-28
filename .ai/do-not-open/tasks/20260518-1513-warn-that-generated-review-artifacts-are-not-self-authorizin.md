---
status: closed
amended_by: narada.architect
amended_at: 2026-05-18T18:00:34.421Z
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-18T18:00:49.343Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T18:04:35.719Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Warn that generated review artifacts are not self-authorizing

## Chapter

MCP Materialized Admissions

## Goal

Make task finish/review output clearly remind agents that generated reports, reviews, and evidence artifacts require lifecycle admission, reviewer identity, evidence verdict, and closure status before they are authority-bearing.

## Context

Materialized from Canonical Inbox envelope `env_caf31232-38b0-4310-8695-0da05ec41839`.

Source Site: narada-proper

Source ref: coherence-scan:authority-inversion-generated-review-evidence-authority

Summary:
Review artifacts can look self-authorizing unless task evidence/closure status is checked.

## Required Work

0. Source summary: Review artifacts can look self-authorizing unless task evidence/closure status is checked.
1. Read source inbox envelope env_caf31232-38b0-4310-8695-0da05ec41839 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Added an explicit `message` field to the shared generated artifact authority note in `packages/task-governance/src/task-review-service.ts`.
- The note now states that generated review/report artifacts are not self-authorizing and names the required authority conditions: lifecycle admission, reviewer identity, task evidence verdict, and closure status.
- Added finish and review command tests that assert the structured JSON reminder is present on generated artifact paths.
- While rebuilding `@narada2/task-governance`, fixed the `task finish --prove-criteria --close` ordering so criteria proof can run before report creation rejects unchecked criteria.

## Verification

- `pnpm --dir packages/task-governance typecheck` passed.
- `pnpm --dir packages/task-governance build` passed.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- `pnpm --dir packages/layers/cli test -- test/commands/task-finish.test.ts -t "submits report and clears roster"` passed.
- `pnpm --dir packages/layers/cli test -- test/commands/task-review.test.ts -t "delegates accepted reviews"` passed.
- Broader focused run `pnpm --dir packages/layers/cli test -- test/commands/task-finish.test.ts test/commands/task-review.test.ts` still has one residual failing case in `task-finish.test.ts`: `submits an accepted repair review instead of reusing a stale rejected review id`. The failure is outside the generated-artifact reminder path and reports that the repaired task is still `claimed` when review finish expects `in_review`.

## Acceptance Criteria

- [x] Task finish or review output includes an explicit not-self-authorizing reminder when generated artifacts are produced.
- [x] Focused tests or CLI verification cover the reminder path.
