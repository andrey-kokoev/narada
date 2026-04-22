---
status: closed
depends_on: [371]
closed: 2026-04-21
---

# Task 372 — Windows Site Boundary / Design Contract

## Assignment

Validate and tighten the Windows Site materialization design document (`docs/deployment/windows-site-materialization.md`) into an actionable boundary contract. This task produces the canonical reference that Tasks 373–376 will implement against.

## Context

Task 371 produced the initial Windows Site materialization design. Before implementation begins, that design must be reviewed against:
- The Cloudflare materialization (`docs/deployment/cloudflare-site-materialization.md`) to ensure Windows is a true sibling, not a derivative.
- The unattended operation layer (`docs/product/unattended-operation-layer.md`) to confirm Windows substrates satisfy stuck-cycle detection, health decay, and restart safety.
- The existing local development runtime (`packages/layers/cli/`) to identify what can be reused and what must be reimplemented.

## Required Work

1. Read `docs/deployment/windows-site-materialization.md` (produced by Task 371).
2. Read `docs/deployment/cloudflare-site-materialization.md` and identify every boundary that Windows must satisfy in equivalent form.
3. Read `docs/product/unattended-operation-layer.md` and verify Windows lock/recovery/health semantics are workable.
4. Review `packages/layers/cli/src/commands/` for existing local Cycle entrypoints (`sync-once.ts`, `ops.ts`, `recover.ts`). Determine what code can be reused.
5. Produce a **boundary contract** document at `docs/deployment/windows-site-boundary-contract.md` containing:
   - **In-scope**: What the Windows Site materialization must provide.
   - **Out-of-scope**: What it deliberately does not provide.
   - **Authority boundaries**: Which components own lock, health, trace, and secret resolution.
   - **Interface contract**: The exact signatures and files the runner/supervisor/operator surface must implement.
   - **Substrate comparison table**: Windows native vs WSL vs Cloudflare side-by-side.
   - **Reuse inventory**: Existing CLI/kernel code that can be imported vs new code that must be written.
6. Update `docs/deployment/windows-site-materialization.md` with any corrections discovered during the review.

## Acceptance Criteria

- [x] `docs/deployment/windows-site-boundary-contract.md` exists and is self-standing.
- [x] In-scope / out-of-scope lists are explicit and defensible.
- [x] Authority boundaries match existing kernel invariants (Foreman owns work opening, Scheduler owns leases, etc.).
- [x] Substrate comparison table includes Windows native, WSL, and Cloudflare.
- [x] Reuse inventory identifies at least three existing modules that can be imported.
- [x] No Windows runtime code is written in this task.

## Execution Notes

- Boundary contract created: [`docs/deployment/windows-site-boundary-contract.md`](../../docs/deployment/windows-site-boundary-contract.md)
  - 449 lines; 14 in-scope items, 9 out-of-scope items, 9 authority boundaries
  - Full interface contract with TypeScript signatures for: `WindowsSiteRunner`, `WindowsSiteSupervisor`, `SiteStatusQuery`, `SiteDoctorQuery`, `CredentialResolver`, `SitePathResolver`
  - Substrate comparison table: 18 rows × 3 substrates (Cloudflare, Native Windows, WSL)
  - Reuse inventory: 12 existing kernel modules, 5 existing CLI commands to extend, 6 new modules to write
- Corrections applied to `docs/deployment/windows-site-materialization.md`:
  - §3.3: Lock/recovery model changed from "SQLite row-level lock" to `FileLock` from `@narada2/control-plane`
  - §4 Step 1: "SQLite row lock" → "`FileLock`"; Step 8: "SQLite lock" → "`FileLock`"
  - §5: `flock()` replacement changed from "SQLite transaction-level locking" to `FileLock`
  - §6: Clarified that `FileLock` metadata holds the lock, SQLite holds compact state
  - §10: Package location consolidated from `windows-native/` + `windows-wsl/` to single `packages/sites/windows/`
- Key finding: `FileLock` already implements cross-platform Windows locking (via `tasklist` PID check and `mkdir`-based locking). No new lock implementation is needed.
- Key finding: `computeHealthTransition()` in `@narada2/control-plane/src/health.ts` already implements the unattended operation layer state machine exactly. No new health transition logic is needed.
- Key finding: Existing CLI commands (`sync`, `ops`, `doctor`, `status`, `recover`) are extended with `--site` flags; only `narada cycle` is a genuinely new command.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
