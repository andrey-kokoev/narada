---
status: closed
depends_on: [347]
closed: 2026-04-21
---

# Task 348 — Confirmation/Reconciliation Step

## Context

Cloudflare Cycle step 6 should reconcile attempted effects against observed world state.

For this chapter, real effects and live world observation are out of scope. The required proof is that confirmation remains a separate boundary and is not self-confirmed by evaluation or execution.

## Goal

Implement fixture-backed confirmation/reconciliation for Cloudflare kernel-spine records.

## Required Work

### 1. Define fixture observation input

Define a synthetic observation input that can confirm or fail to confirm an intent/outbound handoff.

It should be distinct from the evaluation and decision records.

### 2. Implement step 6 handler

The handler should:

- read pending intent/outbound handoff records
- read fixture observation records
- mark confirmed only when an observation matches
- leave unconfirmed records pending or residualized
- report counts in step result

### 3. Tests

Add focused tests proving:

- matching observation confirms an intent/handoff
- missing observation does not confirm
- evaluator output alone cannot confirm
- execution/attempt record alone cannot confirm unless the fixture observation says so

## Non-Goals

- Do not send email.
- Do not call Graph.
- Do not implement live reconciliation.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Step 6 performs fixture-backed reconciliation.
- [x] Confirmation requires separate observation input.
- [x] Self-confirmation is impossible in tests.
- [x] Step result reports confirmed/unconfirmed counts.
- [x] No derivative task-status files are created.

## Execution Notes

**Implementation:**

1. `packages/sites/cloudflare/src/coordinator.ts` — Extended schema and interface with confirmation surfaces:
   - New table: `fixture_observations` (observation_id, outbound_id, scope_id, observed_status, observed_at)
   - `getPendingOutboundCommands()` — queries outbound commands with status `pending`
   - `updateOutboundCommandStatus(outboundId, status)` — updates outbound status
   - `insertFixtureObservation()` / `getFixtureObservations()` — observation CRUD

2. `packages/sites/cloudflare/src/cycle-step.ts` — Added `createReconcileStepHandler(observations)`:
   - Queries pending outbound commands
   - Matches against externally-provided `FixtureObservation[]` array
   - Updates status to `confirmed` only when observation has `observedStatus: "confirmed"`
   - Unconfirmed outbounds remain `pending`
   - Reports confirmed/unconfirmed counts in residuals

3. `packages/sites/cloudflare/test/fixtures/coordinator-fixture.ts` — Added mock implementations for reconciliation methods.

**Tests:** `packages/sites/cloudflare/test/unit/reconciliation.test.ts` — 6 focused tests:
1. Matching observation confirms an outbound command
2. Missing observation does not confirm
3. Evaluator output alone cannot confirm (no outbound exists without handoff)
4. Execution record alone cannot confirm unless observation says so
5. Partial confirmation when only some observations match
6. Self-confirmation is impossible without external observation

**Verification:**
- `npx vitest run test/unit/reconciliation.test.ts` — 6/6 pass
- Full Cloudflare suite — 127/127 pass across 16 test files
- `pnpm verify` — 5/5 pass

## Suggested Verification

```bash
pnpm --filter @narada2/cloudflare-site exec vitest run <focused reconciliation test>
pnpm verify
```

