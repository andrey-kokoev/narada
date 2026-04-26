---
status: closed
depends_on: []
closed_at: 2026-04-26T19:54:51.027Z
closed_by: codex
governed_by: task_close:codex
---

# Task 594 - Project Windows Site root policy by authority locus

## Context

Part of the Windows Site Root Policy By Authority Locus chapter (Tasks 594–594).

Task 593 introduced the `user` / `pc` authority-locus axis for Windows Sites, but root policy still mostly surfaced as substrate-only `%LOCALAPPDATA%` paths. The next step is to project the Windows idiom into docs and package helpers:

- user-locus native Site: `%USERPROFILE%\.narada`;
- PC-locus native Site: `%ProgramData%\Narada\sites\pc\{site_id}`;
- legacy `%LOCALAPPDATA%\Narada\{site_id}` remains compatible but is not the new authority-locus policy.

## Goal

Make Windows Site root and registry policy explicit by authority locus without breaking legacy path callers.

## Acceptance Criteria

- [x] `@narada2/windows-site` exports a root resolver that takes `authorityLocus`.
- [x] Native user-locus root resolves to `%USERPROFILE%\.narada`.
- [x] Native PC-locus root resolves to `%ProgramData%\Narada\sites\pc\{site_id}`.
- [x] Registry path helpers can resolve user-locus and PC-locus native registry paths.
- [x] Windows Site docs state the User Site telos and the PC Site ProgramData root.
- [x] Legacy `%LOCALAPPDATA%` path behavior remains documented as compatibility, not removed.
- [x] Windows Site build and tests pass.

## Execution Mode

Proceed directly or start in planning mode depending on write set.

## Execution Notes

- Added `resolveWindowsSiteRootByLocus()` for authority-locus root policy while keeping `resolveSiteRoot()` as the legacy compatibility resolver.
- Added `resolveRegistryDbPathByLocus()` for user-locus and PC-locus registry paths while keeping `resolveRegistryDbPath()` compatible.
- Documented the Windows User Site telos as the operator's personal working memory and control surface, and the PC Site root as ProgramData-backed machine/session state.

## Verification

- `pnpm --filter @narada2/windows-site build`
- `pnpm --filter @narada2/windows-site exec vitest run test/unit/path-utils.test.ts test/unit/registry.test.ts`
- `pnpm --filter @narada2/windows-site test`
- `pnpm exec tsx scripts/task-file-guard.ts`

## Outcome

Accepted. Windows Site root policy is now projected through authority locus without removing legacy `%LOCALAPPDATA%` behavior.

