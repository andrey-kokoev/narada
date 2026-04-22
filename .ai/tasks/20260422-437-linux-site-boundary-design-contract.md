---
status: opened
depends_on: [429]
---

# Task 437 — Linux Site Boundary / Design Contract

## Assignment

Validate and tighten the Linux Site materialization design document (`docs/deployment/linux-site-materialization.md`) into an actionable boundary contract. This task produces the canonical reference that Tasks 438–441 will implement against.

## Context

Task 429 produced the initial Linux Site materialization design. Before implementation begins, that design must be reviewed against:
- The Cloudflare materialization (`docs/deployment/cloudflare-site-materialization.md`) to ensure Linux is a true sibling, not a derivative.
- The Windows materialization (`docs/deployment/windows-site-materialization.md` and `docs/deployment/windows-site-boundary-contract.md`) to identify reuse opportunities.
- The unattended operation layer (`docs/product/unattended-operation-layer.md`) to confirm Linux substrates satisfy stuck-cycle detection, health decay, and restart safety.
- The existing local development runtime (`packages/layers/cli/`) to identify what can be reused and what must be reimplemented.

## Required Work

1. Read `docs/deployment/linux-site-materialization.md` (produced by Task 429).
2. Read `docs/deployment/cloudflare-site-materialization.md` and identify every boundary that Linux must satisfy in equivalent form.
3. Read `docs/deployment/windows-site-boundary-contract.md` and identify reuse opportunities.
4. Read `docs/product/unattended-operation-layer.md` and verify Linux lock/recovery/health semantics are workable.
5. Review `packages/layers/cli/src/commands/` for existing local Cycle entrypoints (`sync-once.ts`, `ops.ts`, `recover.ts`). Determine what code can be reused.
6. Review `docs/deployment/systemd/narada-daemon.service` for existing systemd conventions.
7. Produce a **boundary contract** document at `docs/deployment/linux-site-boundary-contract.md` containing:
   - **In-scope**: What the Linux Site materialization must provide.
   - **Out-of-scope**: What it deliberately does not provide.
   - **Authority boundaries**: Which components own lock, health, trace, and secret resolution.
   - **Interface contract**: The exact signatures and files the runner/supervisor/operator surface must implement.
   - **Substrate comparison table**: Linux system-mode vs user-mode vs Cloudflare vs Windows side-by-side.
   - **Reuse inventory**: Existing CLI/kernel code that can be imported vs new code that must be written.
8. Update `docs/deployment/linux-site-materialization.md` with any corrections discovered during the review.

## Acceptance Criteria

- [ ] `docs/deployment/linux-site-boundary-contract.md` exists and is self-standing.
- [ ] In-scope / out-of-scope lists are explicit and defensible.
- [ ] Authority boundaries match existing kernel invariants (Foreman owns work opening, Scheduler owns leases, etc.).
- [ ] Substrate comparison table includes Linux system-mode, Linux user-mode, Cloudflare, and Windows.
- [ ] Reuse inventory identifies at least three existing modules that can be imported.
- [ ] No Linux runtime code is written in this task.
