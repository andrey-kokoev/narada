---
status: opened
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

- [ ] `docs/deployment/macos-site-boundary-contract.md` exists and is self-standing.
- [ ] In-scope / out-of-scope lists are explicit and defensible.
- [ ] Authority boundaries match existing kernel invariants (Foreman owns work opening, Scheduler owns leases, etc.).
- [ ] Substrate comparison table includes Cloudflare, Windows native, Windows WSL, and macOS.
- [ ] Reuse inventory identifies at least three existing modules that can be imported.
- [ ] No macOS runtime code is written in this task.
