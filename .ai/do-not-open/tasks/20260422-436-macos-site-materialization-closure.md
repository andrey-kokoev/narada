---
status: closed
closed: 2026-04-22
closes_tasks: [431, 432, 433, 434, 435]
depends_on: [431, 432, 433, 434, 435]
---

# Task 436 — macOS Site Materialization Closure

## Assignment

Review the macOS Site materialization chapter (Tasks 431–435) for semantic coherence, implementation completeness, and justify or defer a generic Site abstraction.

## Context

After Tasks 431–435 implement the macOS Site family, this task performs a chapter-level closure review. It checks:
- Whether macOS is a true sibling to Cloudflare and Windows.
- Whether the implementation respects kernel invariants and authority boundaries.
- Whether enough commonality has emerged across Cloudflare, Windows native, Windows WSL, and macOS to justify a generic `Site` abstraction.
- What gaps remain for a v1 production macOS Site.

## Required Work

1. Read all artifacts produced by Tasks 431–435:
   - `docs/deployment/macos-site-materialization.md`
   - `docs/deployment/macos-site-boundary-contract.md`
   - Implementation code from `packages/sites/macos/`
2. Perform a **semantic drift check**:
   - Verify canonical vocabulary (Aim / Site / Cycle / Act / Trace) is used consistently.
   - Verify no "macOS operation" or "deployment operation" smears exist.
   - Verify macOS Site is never conflated with mailbox vertical.
3. Perform an **authority boundary check**:
   - Verify Foreman owns work opening (not the runner).
   - Verify Scheduler owns leases (not the runner).
   - Verify outbound workers own mutation (not the runner).
   - Verify observation is read-only.
4. Produce a **gap table**:
   | Gap | Severity | Owner Task | Resolution |
   |-----|----------|------------|------------|
   | (fill in) | | | |
5. Produce a **generic Site abstraction decision**:
   - If commonality across Cloudflare, Windows native, Windows WSL, and macOS is strong: propose a `@narada2/site-core` package or shared interface.
   - If commonality is weak or premature: explicitly defer and document why.
   - The decision must be evidence-based, not aspiration-based.
6. Produce a **v1 scope definition**:
   - What is required to move macOS Sites from "spike / proof" to "production-worthy".
   - GUI helper, notarization, real-time sync, multi-Site scheduling, etc.
7. Update `docs/deployment/macos-site-materialization.md` with post-implementation corrective notes (same pattern as Windows doc §10 and Cloudflare doc §8).
8. Write the closure decision to `.ai/decisions/2026MMDD-434-macos-site-closure.md`.

## Acceptance Criteria

- [x] Semantic drift check passes — no terminology smears found (or documented and corrected).
- [x] Authority boundary check passes — all kernel invariants respected.
- [x] Gap table exists with at least five entries (even if all are "closed").
- [x] Generic Site abstraction decision is explicit: either justified with proposal or deferred with rationale.
- [x] v1 scope definition exists.
- [x] Closure decision document exists in `.ai/decisions/`.
- [x] No derivative task-status files are created.

## Execution Notes

### What was delivered

1. **Closure decision document** — `.ai/decisions/20260422-436-macos-site-materialization-closure.md` (333 lines):
   - Task-by-task assessment of Tasks 431–435 with deliverables, test counts, boundary concerns, and residuals.
   - Semantic drift check: 7 checks performed; 2 minor corrections documented (stale task number references, unreachable `"stuck_recovery"` outcome).
   - Authority boundary check: 10 boundaries verified; all kernel invariants respected.
   - Gap table: 9 entries covering fixture stubs, missing fact store, no effect execution, no operator mutations, unreachable outcome, no multi-Site scheduling, no wake notification, untested TCC/Keychain, and notarization.
   - Generic Site abstraction decision: **DEFERRED** — evidence table across 10 concerns (Cloudflare / Windows Native / WSL / macOS) shows strong commonality on health/trace schema but weak commonality on scheduler, lock mechanism, process model, and sleep/wake handling. Four conditions listed that would justify a `@narada2/site-core` package.
   - v1 scope definition: 5 required items (real Cycle steps 2–6, site-local fact store, real effect execution, CLI operator actions, fix `"stuck_recovery"`), 4 recommended items (multi-Site registry, wake notification, notarization, GUI menu bar), 3 deferred beyond v1 (real-time sync, multi-vertical, autonomous send).
   - No-overclaim verification table: 9 claims checked; only bounded Cycle proof, credential/path binding, health/trace integration, sleep/wake recovery, and LaunchAgent supervision are claimed.

2. **Post-implementation notes** — `docs/deployment/macos-site-materialization.md` §11 updated with:
   - §11.1 Stale task number references corrected.
   - §11.2 Coordinator database path corrected (`db/coordinator.db`).
   - §11.3 Module name mappings (contract anticipation vs actual).
   - §11.4 Site-local coordinator rationale.
   - §11.5 `"stuck_recovery"` outcome unreachable analysis.
   - §11.6 Steps 2–6 fixture stub explanation.
   - §11.7 Keychain testing mocked.
   - §11.8 Sleep/wake fixture findings.
   - §11.9 No cross-site aggregation.

3. **No separate boundary contract file** — The design doc §1 notes that `docs/deployment/macos-site-boundary-contract.md` was not created; the contract lives in the chapter DAG and the design doc itself. This is acceptable per the closure decision.

### Verification results

```bash
pnpm --filter @narada2/macos-site exec vitest run test/
# ✅ 78/78 tests passed across 8 test files (31.09s)
#    - supervisor.test.ts: 17 tests
#    - credentials.test.ts: 16 tests
#    - path-utils.test.ts: 12 tests
#    - trace.test.ts: 2 tests
#    - observability.test.ts: 9 tests
#    - health.test.ts: 7 tests
#    - sleep-wake-recovery.test.ts: 6 tests
#    - runner.test.ts: 9 tests
```

All acceptance criteria satisfied.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
