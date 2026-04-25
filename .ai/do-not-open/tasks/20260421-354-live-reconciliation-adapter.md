---
status: closed
closed: 2026-04-21
depends_on: [351]
---

# Task 354 — Live Reconciliation Adapter

## Context

Task 348 proved fixture-backed confirmation. Cloudflare Site v1 needs a live read-only reconciliation seam that can confirm effects from observed world state without re-performing effects or trusting executor success.

This task should remain read-only.

## Goal

Implement or spike a bounded live reconciliation-read adapter for Cloudflare Site.

## Required Work

### 1. Select reconciliation target

Choose one bounded target:

- Graph message/draft/sent-item observation, or
- webhook observation, or
- documented blocker proof if no coherent live read exists yet.

### 2. Preserve confirmation boundary

The adapter may only create or provide observations. Confirmation must still be performed by reconciliation logic.

It must not:

- create decisions
- execute effects
- mark success based on attempted execution alone
- self-confirm from outbound command existence

### 3. Tests

Add focused tests with mocked network/bindings proving:

- matching live-style observation confirms pending handoff
- missing observation leaves handoff pending
- adapter failure does not fabricate confirmation

## Non-Goals

- Do not execute sends or drafts.
- Do not call Graph mutating APIs.
- Do not treat API success from effect attempt as confirmation.
- Do not claim production readiness.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] A bounded reconciliation-read seam exists, or concrete blocker proof exists.
- [x] Confirmation still requires separate observation.
- [x] Adapter failure cannot fabricate confirmation.
- [x] Focused tests or blocker evidence exist.
- [x] No derivative task-status files are created.

## Execution Notes

**Reconciliation target:** Graph API read-only observation seam (`GraphLiveObservationAdapter`).

Webhook observation was considered but Graph API provides stronger identity signals (`internetMessageId`, outbound header injection) for confirming sends. The adapter is read-only — it queries, never mutates.

**Implementation:**

1. `packages/sites/cloudflare/src/reconciliation/live-observation-adapter.ts`
   - `LiveObservationAdapter` interface: `fetchObservations(pending: PendingOutbound[]) => Promise<LiveObservation[]>`
   - `GraphObservationClient` interface — mockable boundary with three lookup methods:
     - `findMessageByInternetMessageId` — strongest identity signal for sends
     - `findMessageByOutboundHeader` — fallback using outbound_id header injected by worker
     - `findMessageById` — for non-send actions (mark_read, move_message, set_categories)
   - `GraphLiveObservationAdapter` — implements the interface:
     - `send_reply` / `propose_action`: tries `internetMessageId` first, falls back to header lookup
     - `mark_read`: observes `isRead` flag on target message
     - `move_message`: verifies message is in destination folder
     - `set_categories`: verifies all expected categories are present
     - Per-item error handling — one lookup failure does not block others or fabricate confirmation

2. `packages/sites/cloudflare/src/cycle-step.ts`
   - `createLiveReconcileStepHandler(adapter)` — step-6 handler
   - Adapter failure caught and treated as empty observations (`adapter_fetch_failed` residual)
   - Confirmation only when `obs.observedStatus === "confirmed"`
   - Self-confirmation is impossible — handler cannot generate observations from its own state

3. `packages/sites/cloudflare/test/unit/live-reconciliation-adapter.test.ts` — 16 focused tests:
   - Adapter: send_reply by internetMessageId, send_reply by header, message not found, client throws, partial failure across multiple outbounds, mark_read confirmed/failed, move_message confirmed, set_categories confirmed, propose_action treated as send_reply, missing payload handling
   - Handler integration: matching observation confirms, missing observation leaves pending, adapter failure does not fabricate, partial confirmation, self-confirmation impossibility

**Known bounded limitation:** Non-send actions (`mark_read`, `move_message`, `set_categories`) require `payloadJson` on `PendingOutbound`, but the current `outbound_commands` schema and handoff step do not yet populate `payload_json`. The schema and adapter support it; the handoff step needs to be extended when non-send actions are implemented.

**Verification:**
- `pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/live-reconciliation-adapter.test.ts` — 16/16 pass
- Full Cloudflare suite — 194/194 pass across 22 test files
- `pnpm verify` — 5/5 pass
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
