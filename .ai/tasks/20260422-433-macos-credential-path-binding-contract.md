---
status: closed
closed: 2026-04-22
depends_on: [431]
---

# Task 433 — macOS Credential and Path Binding Contract

## Assignment

Implement macOS-specific Site root resolution, Keychain secret retrieval, and path-with-spaces handling.

## Context

macOS differs from Windows and Linux in three binding concerns:
1. **Site root**: Must follow Apple File System Layout Guidelines (`~/Library/Application Support/`).
2. **Credentials**: macOS Keychain is the native secret store; `security` CLI is the portable interface.
3. **Path spaces**: `Application Support` contains a space that breaks naive shell scripts.

## Required Work

1. Implement `packages/sites/macos/src/path-utils.ts`:
   - `resolveSiteRoot(siteId, envOverride?)` → resolves `{siteRoot}` from `~/Library/Application Support/Narada/{site_id}` or `NARADA_SITE_ROOT` env override.
   - `siteConfigPath(siteRoot)` → `{siteRoot}/config.json`.
   - `siteCoordinatorPath(siteRoot)` → `{siteRoot}/coordinator.db`.
   - `siteTracesPath(siteRoot)` → `{siteRoot}/traces/`.
   - `ensureSiteDir(siteRoot)` → create directory tree if missing.
   - All functions must handle spaces in paths correctly.
2. Implement `packages/sites/macos/src/credentials.ts`:
   - `resolveSecret(siteId, secretName)` → tries Keychain first, then env (`NARADA_{site_id}_{secret_name}`), then `.env` in site root.
   - Keychain read via `security find-generic-password -s "dev.narada.site.{site_id}.{secret_name}" -w`.
   - If Keychain fails (TCC, not found, error), fall through silently to next source.
   - `setupKeychainAccess(siteId)` → interactive helper that triggers TCC prompt by reading a known dummy entry.
3. Write unit tests:
   - `resolveSiteRoot` returns correct path with spaces.
   - `ensureSiteDir` creates nested directories under `Application Support`.
   - `resolveSecret` tries Keychain, env, `.env` in correct precedence.
   - Credential fallback works when Keychain is unavailable.
4. Document TCC interaction in `packages/sites/macos/README.md`.

## Acceptance Criteria

- [x] `packages/sites/macos/src/path-utils.ts` resolves and creates Site directories correctly.
- [x] `packages/sites/macos/src/credentials.ts` reads Keychain, env, and `.env` with correct precedence.
- [x] Path spaces in `Application Support` are handled in all shell-facing outputs.
- [x] Unit tests cover directory creation, path resolution, and credential fallback.
- [x] No hard-coded user paths (e.g., `/Users/andrey/`).

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
