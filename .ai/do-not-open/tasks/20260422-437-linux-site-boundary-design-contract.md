---
status: closed
created: 2026-04-22
depends_on: [429]
closed_at: 2026-04-23T20:06:27.000Z
closed_by: a2
governed_by: task_close:a2
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

- [x] `docs/deployment/linux-site-boundary-contract.md` exists and is self-standing.
- [x] In-scope / out-of-scope lists are explicit and defensible.
- [x] Authority boundaries match existing kernel invariants (Foreman owns work opening, Scheduler owns leases, etc.).
- [x] Substrate comparison table includes Linux system-mode, Linux user-mode, Cloudflare, and Windows.
- [x] Reuse inventory identifies at least three existing modules that can be imported.
- [x] No Linux runtime code is written in this task.

---

## Execution Notes

### Document Review

Read and compared all prerequisite documents identified in the task context:

1. **`docs/deployment/linux-site-materialization.md`** (Task 429) — 727-line design document with 13 sections covering Linux system-mode, user-mode, and container-hosted variants.
2. **`docs/deployment/cloudflare-site-materialization.md`** — 311-line sibling substrate design; verified Linux satisfies equivalent boundaries (scheduled invocation, durable coordination, bounded execution, secret binding, operator surface).
3. **`docs/deployment/windows-site-materialization.md`** and **`docs/deployment/windows-site-boundary-contract.md`** — Identified reuse opportunities: `FileLock`, `computeHealthTransition`, `loadConfig`, and the same 8-step Cycle pipeline structure.
4. **`docs/product/unattended-operation-layer.md`** — Confirmed Linux `FileLock` with TTL + atomic steal satisfies §2.2 stuck-cycle recovery protocol; `computeHealthTransition` satisfies §3 health decay semantics.
5. **`packages/layers/cli/src/commands/`** — Reviewed `cycle.ts`, `ops.ts`, `doctor.ts`, `status.ts`, `recover.ts` for `--site` extension points and reuse patterns.
6. **`docs/deployment/systemd/narada-daemon.service`** — Existing daemon mode service template (Type=simple); Linux Site uses Type=oneshot for bounded Cycle runner.

### Boundary Contract Validation

The boundary contract `docs/deployment/linux-site-boundary-contract.md` (379 lines, 8 sections) was validated section by section:

- **§1 In-scope**: 14 boundaries enumerated with system-mode / user-mode / rationale columns. All are defensible and match the implementation.
- **§2 Out-of-scope**: 10 boundaries with explicit deferral rationale. No forbidden claims.
- **§3 Authority boundaries**: 9 concerns with correct kernel owners. No violations.
- **§4 Interface contract**: Type signatures for `LinuxSiteConfig`, `LinuxCycleResult`, `LinuxSiteRunner`, `LinuxSiteSupervisor`, operator surface, credential resolver, and path utilities. Matches actual implementation in `packages/sites/linux/src/`.
- **§5 Substrate comparison**: 5-column table (Cloudflare, Native Windows, WSL, Linux System, Linux User) with 18 rows.
- **§6 Reuse inventory**: 9 existing modules (§6.1), 5 CLI extensions (§6.2), 6 new modules (§6.3).
- **§7 Design corrections**: 6 corrections applied to the materialization doc, all present in §12 of that document.

### Materialization Doc Verification

`docs/deployment/linux-site-materialization.md` contains §12 "Post-Implementation Notes (Tasks 437–441)" which records the corrections and deviations discovered during implementation. This confirms the design review corrections from §7 of the boundary contract were applied.

### Implementation Cross-Check

Compared contract signatures against actual implementation:
- `types.ts` — `LinuxSiteMode`, `LinuxSiteConfig`, `LinuxCycleOutcome`, `LinuxCycleResult` match contract §4.2 exactly.
- `runner.ts` — `DefaultLinuxSiteRunner` implements the 8-step Cycle with `FileLock` acquisition, fixture-backed steps 2–6, health/trace update, and lock release.
- `supervisor.ts` — `generateSystemdService`, `generateSystemdTimer`, `generateCronEntry` match contract §4.4.
- `credentials.ts` — `resolveSecret` and `resolveSecretRequired` implement the documented precedence chains.
- `observability.ts` — `getLinuxSiteStatus`, `listAllSites`, `checkSite` implement the operator surface contract.
- `recovery.ts` — `checkLockHealth` and `recoverStuckLock` implement the unattended layer §2.2 protocol.

## Verification

- Boundary contract exists and is self-standing: `wc -l docs/deployment/linux-site-boundary-contract.md` → 379 lines.
- In-scope / out-of-scope explicit: verified by reading §1 and §2.
- Authority boundaries match kernel invariants: cross-referenced with `AGENTS.md` §Critical Invariants 6–18.
- Substrate comparison includes all four substrates: verified §5 table columns.
- Reuse inventory ≥3 modules: counted 9 in §6.1.
- No runtime code written in task output: document contains only Markdown, TypeScript interface signatures, and tables.
- `pnpm --filter @narada2/linux-site test` → 99 tests pass (8 test files).
- `pnpm --filter @narada2/linux-site typecheck` → passes.
- `pnpm --filter @narada2/linux-site build` → passes.
- `pnpm verify` → all 5 steps pass.

