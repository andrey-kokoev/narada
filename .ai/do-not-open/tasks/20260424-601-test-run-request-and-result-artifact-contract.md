---
status: closed
created: 2026-04-24
depends_on: [600]
governed_by: task_review:a3
closed_at: 2026-04-24T20:51:09.199Z
closed_by: a3
---

# Task 601 - Test Run Request And Result Artifact Contract

## Goal

Define the canonical request and result artifacts for governed test execution.

## Context

If testing is a real zone, then the request and the result must be explicit artifacts, not accidental byproducts of shell invocation.

## Required Work

1. Define the request artifact, at minimum resolving:
   - target command or verification unit
   - focused/full classification
   - task linkage
   - timeout posture
   - environment posture
   - operator/agent/requester identity
2. Define the result artifact, at minimum resolving:
   - terminal status
   - exit classification
   - duration
   - stdout/stderr posture
   - machine-parsed metrics
   - linkage back to request and task
3. Distinguish authoritative result content from advisory summary.
4. Define whether raw stdout/stderr are primary, secondary, truncated, or debug-only.
5. Define how results compose into task verification evidence without becoming duplicated truth.
6. Record verification or bounded blockers.

## Execution Notes

Produced Decision 601 artifact defining canonical request and result artifacts.

**Request artifact (`VerificationRequest`) defined with fields:**
- `request_id`, `task_id`, `target_command`, `scope`, `timeout_seconds`, `env_posture`, `requester_identity`, `requested_at`, `rationale`

**Result artifact (`VerificationResult`) defined with fields:**
- `result_id`, `request_id`, `status`, `exit_code`, `duration_ms`, `metrics`, `stdout_digest`, `stderr_digest`, `stdout_excerpt`, `stderr_excerpt`, `completed_at`

**Authoritative vs advisory split:**
- Authoritative: `status`, `exit_code`, `duration_ms`, `metrics`
- Advisory: excerpts, summaries, rationale

**Task-evidence linkage:** Tasks reference results by `result_id`; never duplicate content.

**Files changed:**
- `.ai/decisions/20260424-601-test-run-request-and-result-artifact-contract.md` (new)

## Verification

- `pnpm verify` — 5/5 steps pass ✅
- Decision artifact reviewed for completeness against all 6 required work items ✅
- No code changes; pure contract/design task ✅

## Non-Goals

- Do not implement storage yet if it belongs in 603.
- Do not leave stdout/stderr authority implicit.

## Acceptance Criteria

- [x] Request artifact is explicit
- [x] Result artifact is explicit
- [x] Authoritative result vs advisory summary split is explicit
- [x] Task-evidence linkage posture is explicit
- [x] Verification or bounded blocker evidence is recorded



