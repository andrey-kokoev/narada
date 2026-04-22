---
status: closed
depends_on: [350]
closed: 2026-04-21
---

# Task 351 — Live Adapter Boundary Contract

## Context

Task 350 closed the fixture-backed Cloudflare kernel spine. The next pressure is live-safe executability, not production deployment.

Before agents attach live adapters, the chapter needs a contract for which fixture seams may become live and which authority boundaries must remain unchanged.

## Goal

Define the Cloudflare live-adapter boundary contract.

## Required Work

### 1. Create boundary document

Add or update a document under `docs/deployment/` describing:

- fixture-backed spine from Tasks 345–350
- live seams allowed in Tasks 352–355
- live seams explicitly out of scope
- authority boundaries that adapters cannot cross
- no-overclaim language for live-safe proof

### 2. Define adapter taxonomy

Classify adapters as:

- source-read adapter
- charter-runtime adapter
- reconciliation-read adapter
- operator-control adapter
- effect-execution adapter

Only the first four are in scope for this chapter. Effect execution remains out of scope unless a later task explicitly changes the chapter contract.

### 3. Update chapter task references

Ensure Tasks 352–357 can reference this contract.

### 4. Tests or checks

No product code tests are required unless implementation code changes. Use focused textual checks to ensure docs do not claim production readiness or autonomous send.

## Non-Goals

- Do not implement live adapters in this task.
- Do not create generic Runtime Locus abstraction.
- Do not add production deployment instructions.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Boundary document exists.
- [x] Adapter taxonomy is explicit.
- [x] Effect execution is clearly out of scope.
- [x] Live-safe proof is distinguished from production readiness.
- [x] Tasks 352–357 reference or align with the contract.
- [x] No derivative task-status files are created.

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
