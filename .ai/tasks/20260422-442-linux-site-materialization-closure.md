---
status: closed
depends_on: [437, 438, 439, 440, 441]
closed: 2026-04-22
closure_artifact: .ai/decisions/20260422-442-linux-site-closure.md
---

# Task 442 — Linux Site Materialization Closure

## Assignment

Review the Linux Site materialization chapter (Tasks 429 and 437–441) for semantic coherence, implementation completeness, and justify or defer a generic Site abstraction.

## Context

After Tasks 437–441 implement the Linux Site family, this task performs a chapter-level closure review. It checks:
- Whether the system-mode and user-mode variants are true siblings to Cloudflare and Windows
- Whether the implementation respects kernel invariants and authority boundaries
- Whether enough commonality has emerged to justify a generic `Site` abstraction
- What gaps remain for a v1 production Linux Site

## Required Work

1. Read all artifacts produced by Tasks 429 and 437–441:
   - `docs/deployment/linux-site-materialization.md`
   - `docs/deployment/linux-site-boundary-contract.md`
   - Implementation code from `packages/sites/linux/`
2. Perform a **semantic drift check**:
   - Verify Aim / Site / Cycle / Act / Trace terminology is used consistently
   - Verify no "Linux operation" or "deployment operation" smears exist
   - Verify Linux Site is never conflated with mailbox vertical
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
   - If commonality between Cloudflare, Windows, and Linux is strong: propose a `@narada2/site-core` package or shared interface
   - If commonality is weak or premature: explicitly defer and document why
   - The decision must be evidence-based, not aspiration-based
6. Produce a **v1 scope definition**:
   - What is required to move Linux Sites from "spike / proof" to "production-worthy"
   - systemd credential loading, Secret Service, full hardening, package manager integration, etc.
7. Update `docs/deployment/linux-site-materialization.md` with post-implementation corrective notes (same pattern as Cloudflare doc §8 and Windows doc §10).
8. Write the closure decision to `.ai/decisions/20260422-442-linux-site-closure.md`.

## Acceptance Criteria

- [x] Semantic drift check passes — no terminology smears found (or documented and corrected).
- [x] Authority boundary check passes — all kernel invariants respected.
- [x] Gap table exists with at least five entries (even if all are "closed").
- [x] Generic Site abstraction decision is explicit: either justified with proposal or deferred with rationale.
- [x] v1 scope definition exists.
- [x] Closure decision document exists in `.ai/decisions/`.
- [x] No derivative task-status files are created.

## Execution Notes

Closed by `.ai/decisions/20260422-442-linux-site-closure.md`.

The closure review accepted the Linux Site materialization chapter as a bounded v0 proof. It verified semantic terminology, authority boundaries, gap table, v1 scope, and the generic Site abstraction decision. Full `@narada2/site-core` extraction remains deferred; a narrower future `@narada2/local-site-core` spike is justified by repeated local-substrate health, trace, coordinator, and runner patterns.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
