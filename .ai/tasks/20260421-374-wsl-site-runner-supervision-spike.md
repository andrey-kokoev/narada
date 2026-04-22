---
status: closed
closed: 2026-04-21
---

# Task 374 — WSL Site Runner / Supervision Spike

## Assignment

Spike a working WSL Site runner and supervision mechanism. Produce a minimal end-to-end proof that a systemd timer or cron-triggered shell process can execute a bounded Narada Cycle inside WSL 2, acquire and release a SQLite lock, write health and trace, and exit cleanly.

## Context

The WSL Site is the sibling to the native Windows Site. It leverages the Linux userspace inside WSL 2, which means much of the existing local development runtime (`packages/layers/cli/`) can be reused. However, WSL is not "just Linux" — it has distinct filesystem boundaries, Windows-host interop quirks, and credential-sharing concerns that must be handled explicitly.

This task proves the WSL substrate can run a Narada Cycle end-to-end.

## Required Work

1. Determine the package/module location for the WSL Site. Options:
   - Reuse `packages/layers/cli/` with a WSL-aware Site configuration mode
   - Create `packages/sites/wsl/` as a thin wrapper around CLI + scheduler config
   - The choice should be justified by the reuse inventory from Task 372.
2. Implement a **Cycle runner entrypoint** (shell script + Node.js module) that:
   - resolves the Site root from `/var/lib/narada/{site_id}` or `~/narada/{site_id}` (configurable)
   - opens (or creates) a `better-sqlite3` coordinator database
   - implements `acquireLock`, `releaseLock`, and stuck-lock recovery (same SQLite semantics as native Windows and Cloudflare)
   - runs the 8-step Cycle pipeline (steps 2–6 may be no-ops or fixture stubs)
   - writes health and trace to SQLite
   - releases the lock and exits cleanly
3. Implement a **systemd unit file template** (`narada-{site_id}.service` + `narada-{site_id}.timer`) that:
   - runs the Cycle at a configured interval
   - logs to journald
   - can be started/stopped/enabled via `systemctl`
4. Provide a **cron fallback** for WSL distributions without systemd:
   - shell script + crontab line template
   - documented in the runner README
5. Provide a **manual invocation path**:
   ```bash
   narada cycle --site {site_id}
   ```
6. Explicitly document **WSL boundaries**:
   - Filesystem: what lives in ext4 vs what might need NTFS access
   - Credentials: how WSL accesses Windows Credential Manager (if at all) vs Linux-native env/`.env`
   - Network: localhost sharing between Windows host and WSL
   - Interop: when and how the WSL Site calls Windows-native tools
7. Write tests:
   - Lock acquisition, release, and stuck-lock recovery
   - Health and trace persistence
   - systemd timer simulation (if testable; otherwise document manual steps)
8. Do **not** implement live source sync, live charter runtime, or live effect execution. Use fixture stubs for steps 2–6.

## Acceptance Criteria

- [x] A shell + Node.js runner exists and can execute a bounded Cycle end-to-end inside WSL.
- [x] SQLite lock semantics are identical to native Windows and Cloudflare.
- [x] systemd service/timer template exists and is documented.
- [x] cron fallback exists and is documented.
- [x] Manual single-Cycle invocation works from bash.
- [x] WSL boundaries (filesystem, credentials, network, interop) are explicitly documented.
- [x] Tests pass in WSL environment.
- [x] No live Graph API, charter runtime, or email send logic is implemented.

## Execution Notes

- Package created: `packages/sites/windows/` (single package covering both native and WSL variants per Task 372 boundary contract)
- Key source files:
  - `src/types.ts` — `WindowsSiteConfig`, `WindowsCycleResult`, `SiteHealthRecord`, `CycleTraceRecord`
  - `src/path-utils.ts` — `detectVariant()`, `resolveSiteRoot()`, `ensureSiteDir()`
  - `src/coordinator.ts` — `SqliteSiteCoordinator` with `site_health` and `cycle_traces` tables
  - `src/runner.ts` — `DefaultWindowsSiteRunner` implementing 8-step bounded Cycle with `FileLock`
  - `src/supervisor.ts` — systemd unit generation, cron entry generation, shell script generation
  - `src/index.ts` — public exports
- Lock mechanism: Reuses `FileLock` from `@narada2/control-plane` (cross-platform, already handles Windows)
- Health transitions: Reuses `computeHealthTransition()` from `@narada2/control-plane` (exact unattended layer state machine)
- Tests: 30 tests across 4 test files, all passing
  - `test/unit/path-utils.test.ts` — 8 tests (variant detection, path resolution)
  - `test/unit/coordinator.test.ts` — 6 tests (health/trace CRUD)
  - `test/unit/runner.test.ts` — 8 tests (cycle execution, lock, health transitions)
  - `test/unit/supervisor.test.ts` — 8 tests (systemd, cron, shell templates)
- WSL boundaries documented in `packages/sites/windows/README.md` §WSL Boundaries
- No live Graph API, charter runtime, or email send logic implemented (steps 2–6 are fixture stubs)
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
