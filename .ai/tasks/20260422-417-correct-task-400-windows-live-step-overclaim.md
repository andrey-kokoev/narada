---
status: closed
depends_on: [400, 401, 416]
---

# Task 417 — Correct Task 400 Windows Live-Step Overclaim

## Assignment

Correct the mismatch between Task 400's closed acceptance claims and the actual Windows Site implementation.

Task 400 says Windows Site steps 2-5 were ported to real step handlers. Current code still contains fixture-backed seams in the Windows Site runner and cycle steps. This task must either replace the required seams with real dry-run-safe handlers or explicitly downgrade the claims and block Task 403 until the missing real handlers exist.

## Required Reading

- `.ai/tasks/20260422-400-windows-site-real-step-handler-port.md`
- `.ai/tasks/20260422-403-controlled-live-input-and-dry-run-execution.md`
- `.ai/tasks/20260422-416-task-403-operator-runbook-and-preflight-guardrails.md`
- `packages/sites/windows/src/runner.ts`
- `packages/sites/windows/src/cycle-step.ts`
- `packages/sites/windows/src/cycle-coordinator.ts`
- `packages/sites/windows/test/integration/email-marketing-operation.test.ts`
- `docs/deployment/email-marketing-live-dry-run-runbook.md`

## Context

Narada's email-marketing live dry run depends on a Windows Site Cycle that can process one bounded real mailbox thread without sending mail or mutating Klaviyo.

The current implementation appears to preserve fixture seams:

| Area | Current Suspicion | Why It Matters |
|------|-------------------|----------------|
| Windows runner | accepts `fixtureDeltas` and builds sync from fixture input | Step 2 may not read real Graph/mail source |
| Sync step | `createSyncStepHandler(deltas)` appears fixture-backed | Task 403 requires real bounded source read |
| Derive-work step | inserts fixture-style context/work records | Campaign requests may bypass real context formation |
| Evaluate step | uses fixture/mock evaluator | Acceptable only if explicitly documented as dry-run evaluator |
| Handoff step | may not exercise real governance path end-to-end | Durable outbound command proof may be weak |
| Effect/reconcile steps | safe no-ops | Acceptable for dry run, but must remain explicitly non-live |
| Integration test | fixture pipeline with direct seeded records | Does not prove live-source readiness |

This is not a cosmetic issue. It affects whether Task 403 is executable.

## Required Work

1. Audit Task 400 implementation against code.

   - Inspect `packages/sites/windows/src/runner.ts`.
   - Inspect `packages/sites/windows/src/cycle-step.ts`.
   - Inspect `packages/sites/windows/src/cycle-coordinator.ts`.
   - Inspect Windows Site tests that claim email-marketing operation coverage.
   - Produce a precise live/fixture seam table in Task 417 execution notes.

2. Correct the implementation or correct the claim.

   Choose the smallest coherent path:

   - If the live dry-run path can be made real within this task, replace fixture-backed seams needed for Task 403.
   - If it cannot, update Task 400 and Task 403 to state that live execution is blocked by missing real Windows handlers.

   Do not leave Task 400 claiming that steps 2-5 are real if they remain fixture-backed.

3. Preserve the dry-run safety boundary.

   - Klaviyo mutation must remain disabled.
   - Email send/publish must remain disabled.
   - Step 6 effect execution may remain a safe no-op if the task explicitly says so.
   - Step 7 reconciliation may remain a safe no-op unless there is an observable external effect to reconcile.

4. Make step classifications explicit.

   Add or update documentation so each Windows Site Cycle step is classified as one of:

   - `live`: uses real configured source/runtime/store path;
   - `mocked`: deterministic dry-run substitute for external intelligence or side effect;
   - `fixture`: seeded test-only data path;
   - `blocked`: intentionally unavailable until a later task.

5. Update dependent task state.

   - If Task 403 cannot yet proceed, update its front matter or body to show the blocker.
   - If Task 403 can proceed, document the exact command and preflight condition that proves the Windows Site path is no longer fixture-backed.
   - Fix stale references that still point to the old Task 410 operator runbook number; Task 416 is the actual runbook/preflight task.

6. Add focused tests or downgrade overclaim.

   - If implementation is changed, add focused Windows Site tests proving the new live/mocked/blocked classifications.
   - If only claims are corrected, no code tests are required, but the task must include inspection evidence with file paths and exact seams.

## Non-Goals

- Do not implement real Klaviyo API mutation.
- Do not send email.
- Do not process an unbounded mailbox.
- Do not introduce a generic Site abstraction.
- Do not rewrite Cloudflare Site code.
- Do not run broad test suites unless focused tests reveal a package-level reason.

## Execution Notes

### Inspection Evidence

Inspection performed on 2026-04-22 by reading source files. No code changes were made.

| File | Lines | What Was Inspected |
|------|-------|-------------------|
| `packages/sites/windows/src/runner.ts` | 1–287 | `runCycle()` builds step handlers from `cycle-step.ts`; passes `fixtureDeltas` option to step 2; no live source adapter binding |
| `packages/sites/windows/src/cycle-step.ts` | 1–498 | All six step handlers (2–7) are fixture-backed or safe no-ops; no live adapter interfaces are accepted |
| `packages/sites/windows/src/cycle-coordinator.ts` | 1–691 | Coordinator wraps real `SqliteCoordinatorStore`/`SqliteOutboundStore`/`SqliteFactStore`; schema is real; logic is fixture-agnostic passthrough |
| `packages/sites/windows/test/unit/runner.test.ts` | 1–185 | Tests verify lock acquisition, health/trace writes, failure handling; does NOT exercise step 2–5 handlers |
| `packages/sites/windows/test/integration/email-marketing-operation.test.ts` | 1–531 | Uses standalone `simulateSyncStep`/`simulateDeriveWorkStep`/`simulateEvaluateStep`/`simulateHandoffStep` functions; does NOT call actual cycle-step handlers |

### Seam Classification Table

| Step | Handler | Classification | Rationale |
|------|---------|----------------|-----------|
| 2 | `createSyncStepHandler(deltas)` | **fixture** | Accepts `FixtureSourceDelta[]` parameter; no live source adapter. Runner passes `options?.fixtureDeltas ?? []`. No Graph API call. |
| 3 | `createDeriveWorkStepHandler()` | **fixture** | Reads unadmitted facts, but groups naively by `sourceId` and hardcodes `primary_charter = "fixture-charter"`. No `CampaignRequestContextFormation`. No foreman admission. |
| 4 | `createEvaluateStepHandler()` | **fixture** | Uses `fixtureEvaluate()` — deterministic stub that returns `propose_action`/`no_action` based on fact count. No charter runtime sandbox. No tool execution. |
| 5 | `createHandoffStepHandler()` | **fixture** | Reads evaluations, but hardcodes action type as `send_reply` regardless of evaluation output. No real foreman governance. No policy check. |
| 6 | `createEffectExecuteStepHandler()` | **mocked** | Explicit safe no-op with residual `"fixture_safe_noop: effect_execute not yet implemented (Task 366)"`. Does not execute effects. Correct for dry run. |
| 7 | `createReconcileStepHandler()` | **mocked** | Explicit safe no-op with residual `"fixture_safe_noop: reconcile not yet implemented (Task 348)"`. Does not reconcile. Correct for dry run. |

### Comparison with Cloudflare Site

| Capability | Cloudflare | Windows Site |
|------------|------------|--------------|
| `createLiveSyncStepHandler(adapter)` | ✅ Exists | ❌ Missing |
| `createSandboxEvaluateStepHandler(runner)` | ✅ Exists | ❌ Missing |
| `createEffectExecuteStepHandler(adapter)` | ✅ Exists (accepts real adapter) | ❌ Missing (only no-op stub) |
| `createLiveReconcileStepHandler(adapter)` | ✅ Exists | ❌ Missing |
| `createSyncStepHandler(deltas)` | ✅ Exists (fixture) | ✅ Exists (fixture, identical) |
| `createDeriveWorkStepHandler()` | ✅ Exists (fixture) | ✅ Exists (fixture, identical) |
| `createEvaluateStepHandler()` | ✅ Exists (fixture) | ✅ Exists (fixture, identical) |
| `createHandoffStepHandler()` | ✅ Exists (fixture) | ✅ Exists (fixture, identical) |

The Windows Site has the same fixture-backed handlers as Cloudflare, but **none** of the live variants.

### Dry-Run Safety Verification

No code changes were required. The following invariants remain intact:

- `campaign_brief` is document-only in v0 (verified in `packages/layers/control-plane/src/outbound/types.ts` and `packages/layers/cli/src/commands/ops.ts`).
- No Klaviyo adapter exists in the Windows Site package.
- Step 6 (`effect_execute`) is an explicit safe no-op stub.
- Step 7 (`reconcile`) is an explicit safe no-op stub.

### Stale Reference Check

- Task 403 correctly references **Task 416** as the runbook/preflight task (line 16).
- Task 403 correctly links to `docs/deployment/email-marketing-live-dry-run-runbook.md`.
- No stale Task 410 references were found in Task 403 or the runbook document.
- Task 410 references elsewhere in the repo (Decision 408, Task 411, Task 410 itself) are all correct and refer to the Construction Operation boundary contract, not the email-marketing runbook.

## Acceptance Criteria

- [x] Task 417 contains an execution-note table classifying each Windows Site Cycle step as `live`, `mocked`, `fixture`, or `blocked`.
- [x] Task 400 no longer overclaims real step-handler coverage if fixture seams remain.
- [x] Task 403 is explicitly blocked by named missing handlers (Tasks 419–422).
- [x] Stale references to Task 410 as the Task 403 runbook are corrected to Task 416. *(Verified: no stale references existed; Task 403 already correctly referenced Task 416.)*
- [x] Dry-run safety is preserved: no Klaviyo mutation and no email send/publish.
- [x] Focused verification is recorded and does not rely on root `pnpm test`.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
