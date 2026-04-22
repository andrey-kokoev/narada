---
status: closed
depends_on: [365]
closed: 2026-04-21
---

# Task 366 — Wire Effect Worker Into Cloudflare Cycle

## Assignment

Execute Task 366.

Use planning mode before editing because this changes Cycle execution ordering and authority boundaries.

## Context

Task 359 implemented `executeApprovedCommands()` as a standalone approved-only effect worker. Task 364 recorded that it is not wired into `runCycle()`.

Cloudflare v1 needs effect execution to be an explicit Cycle step so unattended cycles can advance approved commands to `submitted`.

## Goal

Wire the effect worker into the Cloudflare Cycle as an explicit bounded step without allowing evaluator-driven or unapproved execution.

## Required Work

1. Add an effect-execution step handler or equivalent explicit Cycle integration.
2. Place the step after handoff/operator approval can exist and before reconciliation.
3. Ensure it processes only `approved_for_send` commands.
4. Ensure it never transitions commands to `confirmed`.
5. Ensure step results include counts and residuals in the same style as existing Cycle steps.
6. Add focused tests proving:
   - unapproved commands are skipped during Cycle;
   - approved commands are attempted during Cycle;
   - successful effect execution produces `submitted`;
   - reconciliation remains the only path to `confirmed`;
   - adapter failures do not abort unrelated Cycle bookkeeping unless contract requires it.
7. Update task/chapter docs with honest evidence.

## Non-Goals

- Do not implement real Graph credentials.
- Do not perform live external sends.
- Do not add new effect types.
- Do not change operator approval semantics.
- Do not create derivative task-status files.

## Execution Notes

Implementation was largely present in `cycle-step.ts` (`createEffectExecuteStepHandler`) but had not been fully integrated. Completion required:

1. **Runner fix**: `runner.ts` updated for 9-step cycle with health/trace as step 8 and lock release as step 9. `runCycle` accepts `Partial<Record<CycleStepId, CycleStepHandler>>` and falls back to defaults for missing steps.
2. **Step ordering**: Effect execution is step 6, reconcile is step 7. Order: sync(2) → derive_work(3) → evaluate(4) → handoff(5) → effect_execute(6) → reconcile(7).
3. **Fixture reconcile canonical boundary**: `createReconcileStepHandler` processes **only** `submitted` outbounds. `pending` outbounds are not reconciled — they must pass through effect execution first. Residual updated to `no_submitted_outbound_commands` / `left_N_unconfirmed`.
4. **Effect-worker exception handling**: Unexpected exceptions from `executeApprovedCommands` itself (not adapter throws, which are caught internally) return `status: "failed"`, not `"completed"`.
5. **Handoff fix**: `createHandoffStepHandler` creates outbounds with `actionType: "send_reply"` (not `"propose_action"`) so the effect worker's allowed-action gate passes them.
6. **Test updates**: Updated all tests expecting 8-step cycle to 9-step. Added regression tests for submitted-only reconcile and unexpected exception failure.

Corrections applied 2026-04-21:
- Fixture reconcile made submitted-only (pending outbounds skipped).
- Unexpected effect-worker exceptions changed from `completed` to `failed`.
- Added 2 regression tests.

Verification:
```bash
# Focused 19-test command for Task 366
pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/effect-worker-cycle.test.ts test/unit/reconciliation.test.ts test/unit/cycle-step.test.ts

# Full cloudflare suite + workspace verify
pnpm --filter @narada2/cloudflare-site exec vitest run
pnpm verify
```

## Acceptance Criteria

- [x] Effect worker is invokable as a Cycle step.
- [x] Step ordering preserves execution-before-reconciliation and approval-before-execution.
- [x] Unapproved commands cannot execute.
- [x] Submitted and confirmed remain separate.
- [x] Focused tests cover success, skip, and failure cases.
- [x] No derivative task-status files are created.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
