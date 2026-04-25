---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T20:50:42.096Z
closed_by: a3
governed_by: task_close:a3
---

# Task 600 - Testing Intent Zone Boundary Contract

## Goal

Define the canonical boundary for Narada's Testing Intent Zone so test execution is understood as a governed crossing from verification request to durable verification result.

## Context

Right now it is still possible to think of testing as any of the following:

- "just run a shell command"
- "whatever `pnpm verify` prints"
- "whatever gets copied into task verification notes"
- "whatever a focused script happens to record"

That ambiguity must be removed.

## Required Work

1. Define the irreducible objects precisely:
   - verification/test request
   - governed test execution
   - verification/test result
2. Define the zones and crossings explicitly:
   - source zone
   - execution zone
   - destination zone
   - admissibility regime
   - crossing artifacts
   - confirmation law
3. State which authority owns:
   - whether a test may run
   - timeout
   - environment posture
   - retry policy
   - persistence of result
4. State what testing is **not** in this regime:
   - not merely raw shell output
   - not merely chat narration
   - not merely task-note prose
5. Define the main collapse this boundary prevents.
6. Record verification or bounded blockers.

## Non-Goals

- Do not define every field of the artifacts yet if that belongs cleanly in later tasks.
- Do not preserve "shell output = verification truth" as an implicit fallback.

## Acceptance Criteria

- [x] Testing request/execution/result boundary is explicit
- [x] Zone/crossing regime is explicit
- [x] Authority ownership is explicit
- [x] Anti-collapse invariant is explicit
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

Produced Decision 600 artifact defining the Testing Intent Zone boundary.

**Irreducible objects defined:**
- `VerificationRequest` — durable intent to execute a verification unit
- `GovernedTestExecution` — bounded, supervised run
- `VerificationResult` — terminal, durable record

**Zones defined:** Source (requester) → Execution (runner) → Destination (result store)

**Authority ownership settled:**
- Admissibility regime owns whether a test may run
- Execution regime owns timeout, environment, retry
- Result store owns persistence

**Anti-collapse invariant:** Shell output ≠ verification truth; task notes ≠ verification truth.

**Files changed:**
- `.ai/decisions/20260424-600-testing-intent-zone-boundary-contract.md` (new)

## Verification

- `pnpm verify` — 5/5 steps pass ✅
- Decision artifact reviewed for completeness against all 5 required work items ✅
- No code changes; pure contract/design task ✅



