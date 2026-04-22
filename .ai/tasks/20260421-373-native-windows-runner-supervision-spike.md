---
status: closed
closed: 2026-04-20
depends_on: [372]
---

# Task 373 — Native Windows Runner / Supervision Spike

## Assignment

Spike a working native Windows Site runner and supervision mechanism. Produce a minimal end-to-end proof that a Task Scheduler-triggered PowerShell process can execute a bounded Narada Cycle on Windows 11, acquire and release a SQLite lock, write health and trace, and exit cleanly.

## Context

The Windows Site design (Task 371) and boundary contract (Task 372) define the target shape. This task is the first implementation work: prove the native Windows substrate can actually run a Narada Cycle end-to-end before investing in full feature parity with Cloudflare.

## Required Work

1. Create a package or module location for the native Windows Site. Suggested: `packages/sites/windows-native/` or a script-only materialization under `packages/layers/cli/src/windows/` if code reuse with CLI is high.
2. Implement a **Cycle runner entrypoint** (PowerShell script + Node.js module) that:
   - resolves the Site root from `%LOCALAPPDATA%\Narada\{site_id}`
   - opens (or creates) a `better-sqlite3` coordinator database
   - implements `acquireLock(siteId, cycleId, ttlMs)` using SQLite transactions
   - implements `releaseLock(siteId, cycleId)`
   - implements stuck-lock detection and recovery (TTL comparison + atomic steal)
   - runs the 8-step Cycle pipeline (steps 2–6 may be no-ops or fixture stubs, same as Cloudflare v0)
   - writes health and trace to SQLite
   - releases the lock and exits with appropriate process exit code
3. Implement a **Task Scheduler registration helper** (PowerShell script or CLI command) that:
   - creates a scheduled task for a given Site ID
   - configures the task to run at a user-defined interval
   - logs task output to the Site's `logs/` directory
4. Provide a **manual invocation path** so the operator can run a single Cycle without waiting for the scheduler:
   ```powershell
   narada cycle --site {site_id}
   ```
5. Write tests:
   - Lock acquisition and release
   - Stuck-lock recovery
   - Health record write and read
   - Cycle trace persistence
   - Task Scheduler task creation and deletion (if testable in CI; otherwise document manual verification steps)
6. Do **not** implement live source sync, live charter runtime, or live effect execution. Use fixture stubs for steps 2–6, same as Cloudflare v0.

## Acceptance Criteria

- [x] A PowerShell + Node.js runner exists and can execute a bounded Cycle end-to-end.
- [x] SQLite lock acquisition, release, and stuck-lock recovery are implemented and tested.
- [x] Health and trace are written to SQLite and readable via a CLI or script.
- [x] Task Scheduler registration helper exists and is documented.
- [x] Manual single-Cycle invocation works from PowerShell.
- [x] Tests pass in the local environment (297/297 total, 30/30 package-specific).
- [x] No live Graph API, charter runtime, or email send logic is implemented.
