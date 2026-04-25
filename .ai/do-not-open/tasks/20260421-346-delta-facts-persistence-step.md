---
status: closed
depends_on: [345]
closed: 2026-04-21
---

# Task 346 — Delta/Facts Persistence Step

## Context

Cloudflare Cycle step 2 is supposed to sync source deltas and write durable facts, cursor, and apply-log state.

Live Graph sync is out of scope for this chapter. The required executable proof is fixture-backed delta admission into Cloudflare durable state.

## Goal

Implement a fixture-backed source delta/fact admission step for the Cloudflare kernel spine.

## Required Work

### 1. Extend DO schema if needed

Ensure Cloudflare DO durable state can represent:

- source cursor
- apply-log / admitted event ids
- facts
- fact metadata needed by later fixture governance

Use compact schema. Do not port the entire local coordinator schema unless needed.

### 2. Define fixture source input

Define a test/fixture source input format for synthetic deltas.

It should include:

- source id
- event id
- fact type
- payload JSON
- observed at

### 3. Implement step 2 handler

The step should:

- read fixture source deltas from the step context or coordinator fixture
- deduplicate by event id
- persist facts
- update cursor/apply-log
- return a step result with counts

### 4. Tests

Add focused tests for:

- new deltas become facts
- duplicate event ids are idempotent
- cursor/apply-log updates
- persisted facts are visible to step 3/4 fixtures

## Non-Goals

- Do not call Microsoft Graph.
- Do not implement real webhook ingestion.
- Do not open work items; Task 347 owns downstream governance spine.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Fixture deltas persist as durable facts.
- [x] Duplicate deltas are idempotent.
- [x] Cursor/apply-log state is represented.
- [x] Step result reports admitted/skipped counts.
- [x] Focused tests cover persistence and idempotency.
- [x] No derivative task-status files are created.

## Execution Notes

**Implementation:**

1. `packages/sites/cloudflare/src/types.ts` — Added `FactRecord` and `FixtureSourceDelta` interfaces.
2. `packages/sites/cloudflare/src/coordinator.ts` — Extended DO schema and `CycleCoordinator` interface:
   - New tables: `source_cursors`, `apply_log`, `facts`
   - Methods: `insertFact`, `getFactById`, `getFactCount`, `isEventApplied`, `markEventApplied`, `getAppliedEventCount`, `setCursor`, `getCursor`
3. `packages/sites/cloudflare/src/cycle-step.ts` — Added `createSyncStepHandler(deltas)` factory:
   - Deduplicates via `isEventApplied` / `markEventApplied`
   - Persists facts via `insertFact`
   - Updates cursor via `setCursor`
   - Returns `CycleStepResult` with admitted/skipped counts
4. `packages/sites/cloudflare/test/fixtures/coordinator-fixture.ts` — Added mock implementations for all new fact/cursor/apply-log methods.
5. `packages/sites/cloudflare/test/unit/fact-admission.test.ts` — 6 focused tests:
   - persists fixture deltas as durable facts
   - idempotent for duplicate event ids
   - updates source cursor to last event id
   - skipped when deadline exceeded before start
   - persisted facts visible to downstream step fixtures
   - integrates with full cycle runner

**Verification:**
- `pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/fact-admission.test.ts` — 6/6 pass
- Full Cloudflare suite — 108/108 pass across 14 test files
- `pnpm verify` — all 5 steps pass

## Suggested Verification

```bash
pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/fact-admission.test.ts
pnpm verify
```
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
