---
status: closed
created: 2026-04-24
depends_on: [600, 601]
governed_by: task_review:a3
closed_at: 2026-04-24T20:51:37.572Z
closed_by: a3
---

# Task 602 - Test Execution Regime Contract

## Goal

Define the governed execution regime for tests, including timeout, environment, retry, admissibility, and focused/full posture.

## Context

The middle of the testing line is where arbitrariness currently hides:

- timeout choices
- whether to retry
- whether to permit full suite
- what environment is acceptable
- and how to classify blocked vs failed vs timed out

## Required Work

1. Define admissibility rules for a test run request.
2. Define focused/full/forbidden classes explicitly.
3. Define timeout ownership and timeout classes.
4. Define retry posture:
   - none
   - allowed
   - operator-only
   - automatic in bounded cases
5. Define environment posture:
   - cwd
   - Node/toolchain assumptions
   - fixture/live distinction
6. Define terminal classifications at minimum:
   - passed
   - failed
   - timed_out
   - blocked
   - invalid_request
7. Record verification or bounded blockers.

## Execution Notes

Produced Decision 602 artifact defining the governed test execution regime.

**Admissibility rules:** Registered command, permitted scope, matching environment, no duplicate in-flight.

**Scope classes:**
- `focused` — any requester
- `full` — requires `ALLOW_FULL_TESTS=1`
- `forbidden` live — requires `LIVE_TEST_OK=1`

**Timeout:** Focused default 60s/max 120s; full default 300s/max 600s.

**Retry:** None by default; 1 automatic for known-flaky; operator-only for full suite.

**Terminal classifications:** `passed`, `failed`, `timed_out`, `blocked`, `invalid_request`.

**Files changed:**
- `.ai/decisions/20260424-602-test-execution-regime-contract.md` (new)

## Verification

- `pnpm verify` — 5/5 steps pass ✅
- Decision artifact reviewed for completeness against all 7 required work items ✅
- No code changes; pure contract/design task ✅

## Non-Goals

- Do not implement the persistence schema here.
- Do not leave timeout/retry semantics as command-local folklore.

## Acceptance Criteria

- [x] Admissibility rules are explicit
- [x] Focused/full posture is explicit
- [x] Timeout ownership is explicit
- [x] Retry posture is explicit
- [x] Terminal classifications are explicit
- [x] Verification or bounded blocker evidence is recorded



