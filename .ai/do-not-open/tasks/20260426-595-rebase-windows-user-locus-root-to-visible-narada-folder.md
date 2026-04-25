---
status: opened
depends_on: []
---

# Task 595 — Rebase Windows user-locus root to visible Narada folder

## Context

Part of the Windows User Site Ergonomics chapter (Tasks 595–595).

The live User Site buildout surfaced twelve concrete frictions:

- no productized User Site init;
- registry path policy existed but not the initialization flow;
- no sync-posture config schema;
- authority locus and sync posture were conceptual but weakly operationalized;
- PC-locus remained only a pointer;
- Arc/Chapter shape was manual;
- repo posture was unresolved;
- no friction capture command;
- User Site tasks needed a local namespace distinct from Narada repo tasks;
- Windows/WSL/JSON path handling was noisy;
- `C:\Users\Andrey\narada\not-a-site` proved path spelling is not Site identity;
- no Site doctor validated the new root.

CIPDA clarified that if the real SQLite task lifecycle substrate is already constructively unavoidable, a toy local subset is worse than installing the real substrate with a scoped authority boundary.

## Goal

Make the first upstream slice coherent: native Windows user-locus root policy uses `%USERPROFILE%\Narada`; User Site sync posture exists in config surfaces; `sites init` can materialize a locus-aware Windows User Site and install the real task lifecycle DB.

## Acceptance Criteria

- [x] Native Windows user-locus root resolves to `%USERPROFILE%\Narada`.
- [x] Native user-locus registry path resolves to `%USERPROFILE%\Narada\registry.db`.
- [x] `WindowsSiteConfig` can carry explicit User Site sync posture.
- [x] `narada sites init` accepts `--authority-locus` and `--sync`.
- [x] `narada sites init` materializes locus-aware Windows roots instead of legacy `%LOCALAPPDATA%` roots for new Windows Sites.
- [x] `narada sites init` installs `.ai/tasks/task-lifecycle.db` for Windows Site bootstrap.
- [x] Docs explain visible Windows User Site root and sync posture.
- [x] Focused Windows Site verification passes.
- [ ] CLI focused Vitest is unblocked or replaced by a stable command-level smoke harness.

## Execution Mode

Proceed directly or start in planning mode depending on write set.

## Execution Notes

- Rebased native Windows user-locus root policy from `%USERPROFILE%\.narada` to `%USERPROFILE%\Narada`.
- Added `WindowsUserSiteSyncConfig` / `WindowsUserSiteSyncPosture` to Windows Site config types.
- Extended `narada sites init` with `--authority-locus` and `--sync` for Windows Sites.
- New Windows Site init writes locus-aware config and creates `.ai/tasks/task-lifecycle.db` through the real Narada task lifecycle store.
- Updated Windows Site docs for visible User Site root and sync posture.

## Verification

- `pnpm --filter @narada2/windows-site build` passed.
- `pnpm --filter @narada2/windows-site exec vitest run test/unit/path-utils.test.ts test/unit/registry.test.ts` passed: 47 tests.
- Direct command smoke passed:

```powershell
pnpm exec tsx -e "import { sitesInitCommand } from './packages/layers/cli/src/commands/sites.ts'; ..."
```

The smoke returned `siteRoot: C:\Users\Andrey\Narada`, `locus.authority_locus: user`, and `sync.posture: hybrid_capable_plain_folder`.

`pnpm --filter @narada2/cli exec vitest run test/commands/sites.test.ts` is currently blocked during collection by package entry resolution for optional substrate package `@narada2/macos-site`. This appears in the CLI package test harness before test execution, not in the command smoke path.

## Residuals

- Productize `sites doctor` for User Site root, sync posture, registry, and lifecycle DB validation.
- Productize user/PC registry discovery beyond the root resolver and init path.
- Add first-class friction capture and local Arc/Chapter constructors.
- Decide the Git-backed lifecycle DB sync/export posture for User Sites.
