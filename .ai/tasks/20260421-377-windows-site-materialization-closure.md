---
status: closed
depends_on: [372, 373, 374, 375, 376]
closed_at: 2026-04-21
closure_decision: .ai/decisions/20260421-377-windows-site-closure.md
---

# Task 377 — Windows Site Materialization Closure

## Assignment

Review the Windows Site materialization chapter (Tasks 371–376) for semantic coherence, implementation completeness, and justify or defer a generic Site abstraction.

## Context

After Tasks 372–376 implement the Windows Site family, this task performs a chapter-level closure review. It checks:
- Whether the native Windows and WSL variants are true siblings to Cloudflare
- Whether the implementation respects kernel invariants and authority boundaries
- Whether enough commonality has emerged to justify a generic `Site` abstraction
- What gaps remain for a v1 production Windows Site

## Required Work

1. Read all artifacts produced by Tasks 371–376:
   - `docs/deployment/windows-site-materialization.md`
   - `docs/deployment/windows-site-boundary-contract.md`
   - `docs/deployment/windows-credential-path-contract.md`
   - Implementation code from `packages/sites/windows-native/` (or equivalent)
   - Implementation code from WSL runner (or equivalent)
2. Perform a **semantic drift check**:
   - Verify Aim / Site / Cycle / Act / Trace terminology is used consistently
   - Verify no "Windows operation" or "deployment operation" smears exist
   - Verify Windows Site is never conflated with mailbox vertical
3. Perform an **authority boundary check**:
   - Verify Foreman owns work opening (not the runner)
   - Verify Scheduler owns leases (not the runner)
   - Verify outbound workers own mutation (not the runner)
   - Verify observation is read-only
4. Produce a **gap table**:
   | Gap | Severity | Owner Task | Resolution |
   |-----|----------|------------|------------|
   | (fill in) | | | |
5. Produce a **generic Site abstraction decision**:
   - If commonality between Cloudflare, native Windows, and WSL is strong: propose a `@narada2/site-core` package or shared interface
   - If commonality is weak or premature: explicitly defer and document why
   - The decision must be evidence-based, not aspiration-based
6. Produce a **v1 scope definition**:
   - What is required to move Windows Sites from "spike / proof" to "production-worthy"
   - Windows Service support, real-time sync, multi-Site scheduling, etc.
7. Update `docs/deployment/windows-site-materialization.md` with post-implementation corrective notes (same pattern as Cloudflare doc §8).
8. Write the closure decision to `.ai/decisions/2026MMDD-377-windows-site-closure.md`.

## Acceptance Criteria

- [x] Semantic drift check passes — no terminology smears found (or documented and corrected).
- [x] Authority boundary check passes — all kernel invariants respected.
- [x] Gap table exists with at least five entries (even if all are "closed").
- [x] Generic Site abstraction decision is explicit: either justified with proposal or deferred with rationale.
- [x] v1 scope definition exists.
- [x] Closure decision document exists in `.ai/decisions/`.
- [x] No derivative task-status files are created.

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
