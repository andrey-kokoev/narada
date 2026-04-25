---
status: closed
closed: 2026-04-22
depends_on: [437]
---

# Task 439 — Linux Credential and Path Binding Contract

## Assignment

Implement the Linux Site credential resolver and path utility modules.

## Context

Linux Sites need substrate-specific path resolution and secret binding. System-mode and user-mode have different path conventions and secret stores. This task implements the binding contract defined in Task 437.

## Required Work

1. Read `docs/deployment/linux-site-boundary-contract.md` (Task 437).
2. Create `packages/sites/linux/src/path-utils.ts` implementing `LinuxSitePathResolver`:
   - `sitePath(siteId, mode, ...segments)` — resolve paths under Site root
   - `ensureSiteDir(siteId, mode)` — create Site directory tree with correct permissions
   - `siteConfigPath(siteId, mode)` — resolve config file path
   - `siteDbPath(siteId, mode)` — resolve coordinator DB path
   - `siteLogsPath(siteId, mode)` — resolve logs directory
   - `siteTracesPath(siteId, mode)` — resolve traces directory
   - `siteRuntimePath(siteId, mode)` — resolve runtime state directory
3. Create `packages/sites/linux/src/credentials.ts` implementing `LinuxCredentialResolver`:
   - `resolveSecret(siteId, mode, secretName)` — resolve secret with mode-appropriate precedence
   - System-mode precedence: env → `.env` → config
   - User-mode precedence (v0): env → `.env` → config
   - User-mode precedence (v1): Secret Service → `pass` → env → `.env` → config
4. Handle `NARADA_SITE_ROOT` override for both modes.
5. Add tests for path resolution and credential precedence without requiring live secret stores.

## Acceptance Criteria

- [x] `LinuxSitePathResolver` correctly resolves system-mode and user-mode paths.
- [x] `LinuxCredentialResolver` implements correct precedence for each mode.
- [x] `NARADA_SITE_ROOT` override works for both modes.
- [x] Tests validate path resolution and credential precedence without live secret stores.
- [x] No hard-coded paths to private machine directories.

## Execution Notes

Implementation exists under `packages/sites/linux/`:

- `src/path-utils.ts` defines mode detection, `resolveSiteRoot`, `sitePath`, `ensureSiteDir`, `siteConfigPath`, `siteDbPath`, `siteLogsPath`, `siteTracesPath`, and `siteRuntimePath`.
- `src/credentials.ts` defines `envVarName`, `resolveSecret`, and `resolveSecretRequired` with mode-aware precedence. v0 uses env -> `.env` -> config; systemd credentials, Secret Service, and `pass` are explicitly v1 placeholders returning `null`.
- `NARADA_SITE_ROOT` override is implemented in `resolveSiteRoot` and covered by tests.
- Tests exist in `packages/sites/linux/test/path-utils.test.ts` and `packages/sites/linux/test/credentials.test.ts`.

Bounded residual: Linux v1 native secret stores (`systemd` credentials, Secret Service, `pass`) are named in the resolver but intentionally not integrated in v0.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
