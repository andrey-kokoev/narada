---
status: closed
closed_at: 2026-05-12T19:44:35.477Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Verify Windows-native create-site live carrier orchestration

## Chapter

Windows Native Create Site

## Goal

Verify admitted Windows-native live carrier orchestration for greenfield Site creation.

## Context

Part of Windows Native Create Site chapter.

## Required Work

Run live carrier tests and built CLI smoke for task-lifecycle live create; record carrier list, audit posture, no-import evidence, and non-claims.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Verified admitted Windows-native live carrier orchestration for the task-lifecycle preset.
- Built CLI live smoke ran `narada sites create --preset task-lifecycle ... --execute-live --live-authority-basis ...`.
- Live carrier sequence: `site_local_db_init`, `site_local_storage_hydration`, `site_mcp_registration_transport`, `windows_profile_site_binding`.
- All carrier mutations were target-local under the temporary receiving Site root and authority-gated by `--live-authority-basis`.
- Smoke output reported `source_state_imported: false`; temporary smoke root was removed after execution.

## Verification

- `node --test tools/site-init/site-live-carriers.test.mjs` — passed, 10 tests.
- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` — passed, 22 tests.
- `pnpm --dir packages/layers/cli typecheck` — passed.
- `pnpm --dir packages/layers/cli build` — passed.
- `node packages/layers/cli/dist/main.js sites create --preset task-lifecycle --site-id smoke-task-site --root <temp> --execute-live --live-authority-basis operator_windows_native_smoke --format json` — passed.

## Acceptance Criteria

- [x] Live carrier test suite passes.
- [x] Built CLI task-lifecycle execute-live smoke passes.
- [x] Live mutation remains target-local and authority-gated.
