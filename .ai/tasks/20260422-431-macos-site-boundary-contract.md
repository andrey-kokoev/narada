---
status: closed
closed_by: codex
closed_at: 2026-04-23T14:58:00-05:00
depends_on: [428]
---

# Task 431 — macOS Site Boundary / Design Contract

## Assignment

Validate and tighten the macOS Site materialization design document (`docs/deployment/macos-site-materialization.md`) into an actionable boundary contract. This task produces the canonical reference that Tasks 432–435 will implement against.

## Context

Task 428 produced the initial macOS Site materialization design. Before implementation begins, that design must be reviewed against:
- The Cloudflare materialization (`docs/deployment/cloudflare-site-materialization.md`) to ensure macOS is a true sibling.
- The Windows materialization (`docs/deployment/windows-site-materialization.md`) to distinguish macOS-specific concerns.
- The unattended operation layer (`docs/product/unattended-operation-layer.md`) to confirm macOS substrates satisfy stuck-cycle detection, health decay, and restart safety.
- The existing local development runtime (`packages/layers/cli/`) to identify what can be reused.

## Required Work

1. Read `docs/deployment/macos-site-materialization.md` (produced by Task 428).
2. Read `docs/deployment/cloudflare-site-materialization.md` and identify every boundary that macOS must satisfy in equivalent form.
3. Read `docs/deployment/windows-site-materialization.md` and identify what macOS differs on (scheduler, credentials, paths, permissions).
4. Read `docs/product/unattended-operation-layer.md` and verify macOS lock/recovery/health semantics are workable.
5. Review `packages/layers/cli/src/commands/` for existing local Cycle entrypoints. Determine what code can be reused.
6. Produce a **boundary contract** document at `docs/deployment/macos-site-boundary-contract.md` containing:
   - **In-scope**: What the macOS Site materialization must provide.
   - **Out-of-scope**: What it deliberately does not provide.
   - **Authority boundaries**: Which components own lock, health, trace, and secret resolution.
   - **Interface contract**: The exact signatures and files the runner/supervisor/operator surface must implement.
   - **Substrate comparison table**: Cloudflare vs Windows native vs Windows WSL vs macOS side-by-side.
   - **Reuse inventory**: Existing CLI/kernel code that can be imported vs new code that must be written.
7. Update `docs/deployment/macos-site-materialization.md` with any corrections discovered during the review.

## Acceptance Criteria

- [x] `docs/deployment/macos-site-boundary-contract.md` exists and is self-standing.
- [x] In-scope / out-of-scope lists are explicit and defensible.
- [x] Authority boundaries match existing kernel invariants (Foreman owns work opening, Scheduler owns leases, etc.).
- [x] Substrate comparison table includes Cloudflare, Windows native, Windows WSL, and macOS.
- [x] Reuse inventory identifies at least three existing modules that can be imported.
- [x] No macOS runtime code is written in this task.

## Execution Notes

Discovered during review that the macOS Site package (`packages/sites/macos/`) already exists with substantial implementation from the spike phase (Tasks 428–430). The boundary contract was produced against the actual code, not just the design document, making it significantly more actionable than a speculative contract.

Key findings:
- The existing `FileLock` from `@narada2/control-plane` already handles macOS via `mkdir`-based locking with `mtime` stale detection. No new lock implementation is needed.
- `computeHealthTransition()` from the control plane implements the exact unattended layer state machine. macOS Sites call this function directly.
- CLI commands `cycle.ts`, `status.ts`, and `doctor.ts` already route to macOS Site functions. No new CLI code was needed for basic integration.
- The coordinator database path in the design doc (§8) showed `coordinator.db` at the Site root, but the actual implementation places it at `db/coordinator.db`. Updated the design doc.
- The `MacosCycleOutcome` type includes `"stuck_recovery"` but the runner never emits it. Documented as a v1 cleanup item.

## Verification

- `docs/deployment/macos-site-boundary-contract.md` created (29,557 bytes, 8 sections)
- In-scope: 14 boundaries; out-of-scope: 10 boundaries
- Authority boundaries table: 9 concerns mapped to kernel owners
- Substrate comparison table: 20 rows × 4 substrates
- Reuse inventory: 10 existing modules + 3 existing CLI commands identified
- `docs/deployment/macos-site-materialization.md` updated: filesystem layout corrected, cross-reference to boundary contract added
