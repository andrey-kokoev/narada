---
status: closed
closed_at: 2026-05-12T18:14:59.859Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Reduce false-positive CAPA review diagnostics

## Chapter

Canonical Inbox Promotions

## Goal

Distinguish benign authority/lifecycle review-note mentions from explicit recurrence-risk defects so accepted_with_notes reviews do not create false-positive CAPA recommendations.

## Context

Source inbox envelope: env_7061001b-bdb2-4866-85d1-5ef43ee8dc21

Source: agent_report:narada-andrey-kevin:review-note-capa-noise

Envelope kind: observation

Summary: During task 98 accepted_with_notes review, non-blocking notes that merely described authority/lifecycle verification were classified as lifecycle_authority_defect and produced a CAPA recommendation. This creates false-positive CAPA pressure and can desensitize operators to real CAPA triggers.

Evidence:
- Task 98 review closed successfully, but review_diagnostics marked note findings as lifecycle_authority_defect because text contained authority/lifecycle terms.
- The review command recommended CAPA despite no blocking finding and no actual recurrence defect in the reviewed work.

Proposal:
- Review diagnostics should distinguish semantic mention of authority/lifecycle from an asserted defect. CAPA heuristics should require explicit defect posture, blocking severity, or structured trigger fields, not keyword presence inside benign review notes.

Recommendation: Add regression coverage for accepted review notes that mention authority/lifecycle without creating CAPA recommendation.

## Required Work

0. Source summary: During task 98 accepted_with_notes review, non-blocking notes that merely described authority/lifecycle verification were classified as lifecycle_authority_defect and produced a CAPA recommendation. This creates false-positive CAPA pressure and can desensitize operators to real CAPA triggers.
1. Read source inbox envelope env_7061001b-bdb2-4866-85d1-5ef43ee8dc21 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Target locus: Narada proper task-governance review diagnostics in `D:\code\narada`, under the temporary Narada proper authority admission already recorded for this embodiment.
- Preserved source envelope `env_7061001b-bdb2-4866-85d1-5ef43ee8dc21` as external observation evidence from `narada-andrey.Kevin`.
- Changed `packages/task-governance/src/task-review-service.ts` so non-blocking CAPA relevance requires either a blocking finding or explicit lifecycle/authority defect language. Plain keyword mentions still appear in diagnostic trigger metadata, but they no longer create CAPA pressure by themselves.
- Added regression coverage in `packages/layers/cli/test/commands/task-review.test.ts` for an `accepted_with_notes` review note that mentions authority/lifecycle/evidence verification while explicitly saying no lifecycle authority defect was found.
- Preserved the existing actual-defect test: explicit lifecycle authority defects remain CAPA-relevant.

## Verification

- `pnpm --dir packages/task-governance build` passed.
- `pnpm --dir packages/task-governance typecheck` passed.
- `pnpm --dir packages/task-governance test -- test/lib/task-review-service.test.ts` passed: 7 tests.
- `pnpm --dir packages/layers/cli test test/commands/task-review.test.ts` passed: 17 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.

## Acceptance Criteria

- [x] Accepted review notes that mention authority/lifecycle verification without asserting a defect are not classified as lifecycle_authority_defect.
- [x] Accepted benign notes do not emit a CAPA recommendation.
- [x] Actual lifecycle authority defects remain CAPA-relevant.
