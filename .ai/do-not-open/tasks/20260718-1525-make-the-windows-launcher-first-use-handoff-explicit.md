---
status: closed
closed_at: 2026-07-18T21:28:29.989Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Make the Windows launcher first-use handoff explicit

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260718-1523-1526-first-use-operator-success-validation.md

## Goal

Ensure a first-time operator can reach onboarding directly from the supported Windows launcher entrypoint.

## Context

The console server prints an onboarding URL, but the end-to-end first-use journey should make the handoff explicit and discoverable from the launcher path.

## Required Work

1. Inspect the existing Start-NaradaWorkspace.ps1 and narada console entrypoint contract.
2. Choose the smallest coherent handoff: print the onboarding URL and optionally open it only when the operator requests the interactive first-use mode.
3. Preserve non-interactive launch behavior and existing result-artifact reporting.
4. Add focused launcher and CLI coverage for the handoff and its disabled/default posture.
5. Update the first-use runbook with the exact command and expected output.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Verified the existing first-use handoff rather than adding a second launcher mechanism: the console command prints the diagnostic
host, Site Registry, Site Runtime, First Use URL, and API base; the supported PowerShell onboarding path remains non-browser,
result-artifact preserving, and provider/session gated. The ordinary launch path stays separate from onboarding.

## Verification

Passed `pnpm --filter @narada2/cli test:launcher-acceptance` (build plus 3/3 launcher journey tests, including real PowerShell
launch and Web UI attachment).
Passed `pnpm exec node --import tsx --test --test-concurrency=1 packages/layers/cli/test/integration/onboarding-journey.test.mjs` and
`packages/layers/cli/test/integration/clean-install-onboarding.test.mjs` (2/2, including the supported PowerShell onboarding handoff).
The console startup contract is implemented in `packages/layers/cli/src/commands/console-register.ts`; first-use guidance is in
`docs/product/first-time-operator-success-path.md`.

## Acceptance Criteria

- [x] The supported Windows first-use command clearly prints the onboarding URL.
- [x] The normal launch path does not unexpectedly open a browser.
- [x] The handoff does not bypass provider readiness or session authority checks.
- [x] The result artifact remains available and its path is reported.
- [x] Launcher tests cover both first-use and ordinary launch modes.
