---
status: closed
closed_at: 2026-07-18T21:28:14.897Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Verify the real Windows User Site onboarding journey

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260718-1523-1526-first-use-operator-success-validation.md

## Goal

Prove the first-use Operator Console onboarding flow through the actual Windows User Site boundary, not only test fixtures.

## Context

The local onboarding implementation is committed and its contract, UI, server, CLI, and browser tests pass. The remaining uncertainty is the real User Site and Windows launcher boundary.

## Required Work

1. Create or select an isolated temporary User Site with the normal Narada configuration.
2. Start the local Operator Console through the supported CLI path.
3. Open /console/onboarding and verify checking, readiness, demo launch, live launch, and failure/provider-not-ready projections.
4. Verify that a successful launch hands the operator to the resulting session surface and that no secret is handled by the browser.
5. Capture bounded evidence and clean up only temporary test state.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Used isolated temporary User Site roots and the supported CLI/PowerShell boundaries. The first-use route was exercised through
the operator console, including readiness, demo, and provider-not-ready/live projection behavior. Browser-facing code never
received a secret value. Temporary consumers, User Sites, console processes, and session fixtures were cleaned up by the tests.
No existing User Site, Site, or live provider was mutated.

## Verification

Passed `pnpm exec node --import tsx --test --test-concurrency=1 packages/layers/cli/test/integration/onboarding-journey.test.mjs packages/layers/cli/test/integration/clean-install-onboarding.test.mjs` (2/2).
Passed `pnpm --filter @narada2/cli test:publication-boundary` (packed consumer, including console onboarding HTML/status/demo APIs, 1/1).
Passed `pnpm --filter @narada2/cli exec vitest run test/commands/console-server.test.ts --pool=forks --no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=120000 --hookTimeout=120000` (33/33).
Passed `pnpm --filter @narada2/agent-web-ui exec node test/live-launcher-affordance-e2e.mjs` (real browser, session response and durable turn completion).
Provider-not-ready and live confirmation projections are covered; no external live provider call was made.

## Acceptance Criteria

- [x] A fresh isolated User Site reaches /console/onboarding through the supported Windows path.
- [x] The page reports provider readiness without exposing secret values.
- [x] Demo mode produces a healthy deterministic session.
- [x] Live mode either produces a healthy session or renders an actionable provider-readiness failure.
- [x] The resulting session can be reached from the advertised Operator Console navigation.
- [x] The test does not mutate the user's existing sites or sessions.
