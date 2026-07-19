---
status: closed
closed_at: 2026-07-18T21:28:38.952Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Validate first resident interaction and role expansion

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260718-1523-1526-first-use-operator-success-validation.md

## Goal

Prove the post-onboarding path from one useful resident interaction to a governed recommendation for adding architect and builder roles.

## Context

The first-use journey should minimize decisions: start one resident, make one useful interaction, then let the resident recommend expansion only when justified.

## Required Work

1. Start a resident through the validated onboarding path.
2. Submit one harmless operator request and verify the visible response and session history.
3. Verify that the resident can explain the next role options without silently changing the roster.
4. Document the explicit operator action required to add architect or builder.
5. Add a focused E2E or integration test for the recommendation and opt-in boundary.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

The real launcher-affordance browser E2E starts a temporary runtime, attaches agent-web-ui, waits for onboarding readiness, submits
one harmless operator request, and verifies the durable response/turn completion. The onboarding welcome panel then offers a
resident-first recommendation and emits a role-review intent only; it does not mutate the roster. The recommended next action
is site-scoped and remains under explicit operator authority.

## Verification

Passed `pnpm --filter @narada2/agent-web-ui exec vitest run test/onboarding-welcome-panel.unit.test.ts --pool=forks --no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=120000 --hookTimeout=120000` (4/4).
Passed `pnpm --filter @narada2/agent-web-ui exec node test/live-launcher-affordance-e2e.mjs` (real Chromium path, one provider request,
durable `carrier_turn_completed`, cleanup).
The unit test asserts the exact role-review intent and absence of roster mutation; the live test asserts a useful resident response.

## Acceptance Criteria

- [x] The operator can complete one useful resident interaction after onboarding.
- [x] Role expansion is presented as a recommendation, not an automatic mutation.
- [x] No role is added without explicit operator authority.
- [x] The operator-facing next step is clear and site-scoped.
- [x] The path is covered by an executable test or an explicitly documented residual boundary.
