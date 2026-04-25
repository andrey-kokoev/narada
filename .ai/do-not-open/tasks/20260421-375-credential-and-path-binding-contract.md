---
status: closed
closed: 2026-04-21
depends_on: [372]
---

# Task 375 — Credential and Path Binding Contract

## Assignment

Define and implement the canonical credential resolution and filesystem path binding for both Windows Site variants. This is a cross-cutting contract that Tasks 373 and 374 must implement against.

## Context

Windows native and WSL Sites differ in how they store secrets and resolve filesystem paths:
- Native: Windows Credential Manager or env; `%LOCALAPPDATA%\Narada\{site_id}`
- WSL: Linux env or `.env`; `/var/lib/narada/{site_id}` or `~/narada/{site_id}`

Without a clear contract, each variant will invent its own resolution order and path conventions, leading to operator confusion and test brittleness.

## Required Work

1. Define the **credential resolution precedence** for each variant:
   - Native Windows: Credential Manager → env var → `.env` file → config file
   - WSL: env var → `.env` file → config file (no Credential Manager)
2. Define the **site root resolution**:
   - Native: `%LOCALAPPDATA%\Narada\{site_id}` default; overridable by `NARADA_SITE_ROOT` env var
   - WSL: `/var/lib/narada/{site_id}` default; overridable by `NARADA_SITE_ROOT` env var; fallback to `~/narada/{site_id}`
3. Define the **secret naming convention**:
   - `NARADA_{site_id}_{secret_name}` for env vars (same as Cloudflare)
   - `Narada/{site_id}/{secret_name}` for Credential Manager target names
4. Implement a **shared credential resolver module**:
   - `resolveSecret(siteId, secretName, variant: "native" | "wsl"): string | null`
   - `resolveSiteRoot(siteId, variant: "native" | "wsl"): string`
   - Platform detection: throw clear errors if Credential Manager is requested on non-Windows
5. Implement a **path utility module**:
   - `sitePath(siteId, ...segments): string` — returns OS-appropriate path
   - `ensureSiteDir(siteId): void` — creates site root and standard subdirectories
   - `siteConfigPath(siteId): string`
   - `siteDbPath(siteId): string`
   - `siteLogsPath(siteId): string`
6. Write tests:
   - Credential resolution order (each precedence level)
   - Missing credential handling (clear error, no silent fallback to empty string)
   - Site root resolution with env override
   - Path construction produces correct separators for native vs WSL
   - Directory creation succeeds and is idempotent
7. Document the contract in `docs/deployment/windows-credential-path-contract.md`.

## Acceptance Criteria

- [x] `docs/deployment/windows-credential-path-contract.md` exists and is self-standing.
- [x] Credential resolver module exists with `resolveSecret` and `resolveSiteRoot`.
- [x] Path utility module exists with `sitePath`, `ensureSiteDir`, and standard path getters.
- [x] Resolution precedence is tested for both variants.
- [x] Missing credentials produce clear, actionable errors.
- [x] No Windows runtime code beyond credential/path resolution is written by this task.

## Execution Notes

- Credential contract documented in `docs/deployment/windows-credential-path-contract.md`.
- Credential resolver implemented in `packages/sites/windows/src/credentials.ts`.
- Path utilities implemented in `packages/sites/windows/src/path-utils.ts`.
- Standard site paths are exported from `packages/sites/windows/src/path-utils.ts`.
- Runtime runner/supervision code in `packages/sites/windows/` belongs to Tasks 373 and 374, not this credential/path contract task.

## Verification

All review findings corrected and verified:

```bash
# Typecheck
pnpm --filter @narada2/windows-site typecheck
# → tsc --noEmit (passes)

# Focused tests
pnpm --filter @narada2/windows-site exec vitest run \
  test/unit/credentials.test.ts \
  test/unit/path-utils.test.ts
# → 31 tests pass

# Full package tests
pnpm --filter @narada2/windows-site test
# → 53 tests pass across 5 files
```

Corrections applied:
1. Added `test/unit/credentials.test.ts` with 16 tests covering env precedence, `.env` precedence, config fallback, required-secret error, native-on-non-Windows guard, and empty-string handling.
2. Updated `siteDbPath` to return `db/coordinator.db` (aligned code with docs).
3. Updated `ensureSiteDir` to create standard subdirectories: `state/`, `messages/`, `tombstones/`, `views/`, `blobs/`, `tmp/`, `db/`, `logs/`, `traces/` (aligned code with docs).
4. Implemented WSL fallback to `~/narada/{site_id}` when `/var/lib/narada` is not writable (aligned code with docs).
5. Switched `path-utils.ts` to explicit `win32`/`posix` path modules so native paths always use backslash regardless of runtime platform (aligned code with docs).
6. Removed redundant `src/paths.ts` to eliminate source of confusion.
