---
status: closed
closed_at: 2026-04-26T16:27:05.1557503-05:00
closed_by: codex
depends_on: []
---

# Task 598 — Register PC locus Sites in PC registry

## Context

Part of the PC Locus Registry Registration chapter (Tasks 598–598). Materializing the real PC Site exposed that `sites init --authority-locus pc` created the root and task lifecycle DB but registered in the wrong registry path.

## Goal

Make Windows Site initialization register into the registry for the declared authority locus.

## Acceptance Criteria

- [x] Windows native/wsl `sites init` resolves registry path by authority locus.
- [x] PC-locus initialization writes to `%ProgramData%\Narada\registry.db` for native Windows.
- [x] Existing User-locus behavior remains covered.
- [x] CLI test covers PC-locus registry path.
- [x] Live PC Site doctor passes.

## Execution Mode

Direct implementation.

## Verification

```powershell
pnpm exec tsx packages/layers/cli/src/main.ts sites init desktop-sunroom-2 --substrate windows-native --authority-locus pc --format json
pnpm exec tsx packages/layers/cli/src/main.ts sites doctor desktop-sunroom-2 --root C:\ProgramData\Narada\sites\pc\desktop-sunroom-2 --authority-locus pc --format json
```

Result: PC-locus doctor passes with `registry_db_exists`, `registry_entry`, and `registry_root_match`.

Additional verification:

- `pnpm --filter @narada2/cli exec vitest run test/commands/sites.test.ts`
