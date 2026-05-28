---
status: claimed
amended_by: narada.architect
amended_at: 2026-05-16T19:46:15.365Z
---

# Implement CLI wrappers for local telemetry publish and pull

## Chapter

Site Telemetry Publication / Local Publisher And Puller Tools

## Goal

Implement local CLI/script wrappers around the package client helpers.

## Context

Implements local CLI wrappers for telemetry publish/pull after task 1409.

## Required Work

1. Inspect existing Narada CLI command structure and the Local Publisher/Puller
   tool contract from task 1409.
2. Add minimal CLI wrappers for telemetry publish preflight/dry-run/send and
   remote pull preview/import as specified.
3. Ensure send/import operations require explicit capability/config and do not
   print raw secrets or publish by default.
4. Add command tests for dry-run, missing config, successful prepared request,
   and pull preview.
5. Run focused CLI tests and record residual scheduler/runtime work.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:15.365Z: context, required
  work, dependencies.
- Added `site-telemetry publish` and `site-telemetry pull` CLI command
  registration.
- Added injectable command functions in
  `packages/layers/cli/src/commands/site-telemetry.ts` around the
  Cloudflare telemetry surface client helpers.
- Publish defaults to dry-run and requires explicit `--send` before transport.
- Pull defaults to dry-run and requires explicit `--import` before remote poll.
- Capability resolution happens only in send/import modes; tests use mocked
  resolvers/fetch and assert raw tokens are not serialized in results.
- Added focused CLI tests for dry-run, missing config, prepared mocked send, dry
  pull preview, and mocked import preview.
- Repaired the rejected review gap by adding explicit contract-shaped command
  aliases: `site-telemetry publish plan`, `site-telemetry publish run`,
  `site-telemetry pull plan`, and `site-telemetry pull run`, while preserving
  the compatibility `publish --send` and `pull --import` forms.
- Updated command result envelopes so dry-run publish emits
  `narada.site_telemetry.publish_plan.v0`, dry-run pull emits
  `narada.site_telemetry.pull_plan.v0`, and explicit send/import emits
  `narada.site_telemetry.run_result.v0` with separated transport, pull, local
  admission, and remote finalization posture.

## Verification

- `pnpm install --offline` passed to refresh workspace links for new CLI package
  dependencies.
- `pnpm --dir packages/layers/cli test -- test/commands/site-telemetry.test.ts`
  passed: 5 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- Repair verification: `pnpm --dir packages/layers/cli test --
  test/commands/site-telemetry.test.ts` passed: 5 tests.
- Repair verification: `pnpm --dir packages/layers/cli typecheck` passed.
- Repair verification: `pnpm --dir packages/layers/cli build` passed.

## Acceptance Criteria

- [x] CLI/script wrappers exist.
- [x] Dry-run works without network.
- [x] Tests use mocked fetch and no raw secrets.
