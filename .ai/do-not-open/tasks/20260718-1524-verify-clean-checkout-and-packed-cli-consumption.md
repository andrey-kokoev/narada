---
status: closed
closed_at: 2026-07-18T21:28:22.073Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Verify clean-checkout and packed CLI consumption

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260718-1523-1526-first-use-operator-success-validation.md

## Goal

Prove that the onboarding route and UI artifacts work from the consumer boundary without relying on ignored local dist output.

## Context

Source-level and package-level tests pass, but a clean consumer must prove that the published/packed CLI can resolve the onboarding route and its UI artifacts.

## Required Work

1. Build or pack the required CLI, contract, and UI packages using the supported workspace process.
2. Run the console onboarding route from a clean temporary consumer or packed-package boundary.
3. Verify that /console/onboarding and both onboarding API actions resolve without source-tree-only imports.
4. Record any generated artifact or stale-dist requirements in the operator runbook.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Extended the packed publication-boundary E2E to start the installed CLI's diagnostic console and fetch the real onboarding page,
status API, and demo-start API. Fixed the publication gap exposed by that test: bundled operator-console artifacts are validated
from their installed package root without requiring the source workspace closure. The launch-artifact check retains output and
manifest validation while treating published bundles as source-closure independent. Existing stale-build output remains
actionable through the CLI's required build command.

## Verification

Passed `pnpm --filter @narada2/cli build` (CLI and console artifacts rebuilt).
Passed `node --test packages/layers/cli/test/lib/launch-artifact.test.mjs` (source and relocated published-artifact checks).
Passed `pnpm --filter @narada2/cli test:publication-boundary` (blank consumer pack/install plus onboarding HTML/assets/status/demo, 1/1).
Changed `packages/layers/cli/test/integration/published-cli-install.test.mjs`, `packages/layers/cli/scripts/launch-artifact-lib.mjs`,
`packages/layers/cli/scripts/launch-artifact-lib.d.mts`, `packages/layers/cli/src/lib/launch-artifact.ts`,
`packages/layers/cli/src/commands/console-server.ts`, and the launch-artifact unit test.

## Acceptance Criteria

- [x] A clean consumer resolves the onboarding route without manually copying ignored dist files.
- [x] The route serves the intended onboarding UI assets.
- [x] Onboarding API behavior remains covered at the packed consumer boundary.
- [x] A stale-build failure, if intentionally retained, gives one actionable rebuild command.
