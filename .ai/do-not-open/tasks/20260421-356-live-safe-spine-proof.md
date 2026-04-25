---
status: closed
depends_on: [352, 353, 354, 355]
closed: 2026-04-21
---

# Task 356 — Live-Safe Spine Proof

## Context

Tasks 352–355 attach live or blocker-proven adapter seams around the Cloudflare kernel spine.

This task must prove the bounded live-safe path without turning it into a production-readiness claim.

## Goal

Produce a live-safe proof for the Cloudflare Site v1 adapter spine.

## Required Work

### 1. Build proof fixture

Run a bounded path through `runCycle()` or Worker `/cycle` using whichever seams are proven live by Tasks 352–355.

If some seams are blocked, the proof must explicitly mark them as blocked and use fixture fallback only where the contract allows it.

### 2. Assert authority boundaries

Assert:

- live source read enters as facts
- evaluation remains evidence
- decision remains governed
- intent/handoff remains durable
- confirmation requires observation
- operator mutation is audited

### 3. No-overclaim statement

Update docs or evidence to state exactly what is live and what remains fixture-backed or blocked.

### 4. Tests

Use focused tests. Do not rely on broad full-suite evidence.

## Non-Goals

- Do not claim production readiness.
- Do not add autonomous send.
- Do not hide blocked seams behind fake success.
- Do not create derivative task-status files.

## Execution Notes

**Proof fixture:** `packages/sites/cloudflare/test/unit/live-safe-spine-proof.test.ts` (3 focused tests)

**Seam status table:**

| Seam | Status | Task | Evidence |
|------|--------|------|----------|
| source-read | **live** | 352 | `HttpSourceAdapter` reading from mocked HTTP endpoint |
| charter-runtime | **live** | 353 | `MockCharterRunner` inside `runSandbox` boundary |
| reconciliation-read | **live** | 354 | `GraphLiveObservationAdapter` with mocked Graph client |
| operator-control | **live** | 355 | `executeSiteOperatorAction` with audit-first pattern |
| derive_work | **fixture** | 345 | Internal governance, no external adapter |
| handoff | **fixture** | 347 | Internal governance, no external adapter |
| effect-execution | **blocked/out** | 351 contract | Explicitly out of scope per boundary contract |

**IAS boundaries asserted in tests:**
1. Live source read enters as facts (`coordinator.getFactCount()`)
2. Facts distinct from context/work (`getContextRecordCount`, `getWorkItemCount`)
3. Evaluation distinct from decision (`getEvaluationCount`, `getDecisionCount`)
4. Confirmation requires external observation (`getPendingOutboundCommands` → 0 after live reconcile)
5. Operator mutation is audited (`getOperatorActionRequest` returns executed/rejected records)
6. Rejected mutations do not mutate target (outbound stays `approved_for_send` after failed reject)

**No-overclaim statement:** Test file doc comment explicitly states effect-execution is blocked/out of scope. No production readiness claims are made.

**Verification:**
- `pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/live-safe-spine-proof.test.ts` — 3/3 pass
- Full Cloudflare suite — 197/197 pass across 23 test files

## Acceptance Criteria

- [x] Live-safe proof exists.
- [x] Proof names which seams are live, fixture-backed, or blocked.
- [x] IAS boundaries are asserted.
- [x] Operator mutation audit is included if Task 355 implemented it.
- [x] Focused verification passes.
- [x] No derivative task-status files are created.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
