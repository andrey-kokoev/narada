---
status: closed
closed: 2026-04-21
depends_on: [351]
---

# Task 352 — Live Source Adapter Spike

## Context

Task 346 proved fixture delta admission. This task attaches one bounded live source-read seam to the Cloudflare Site spine.

The goal is not full Graph sync parity. The goal is a live read adapter that admits externally observed data into facts without bypassing fact identity, cursor/apply-log semantics, or downstream governance.

## Goal

Implement or spike a bounded live source-read adapter for Cloudflare Site.

## Required Work

### 1. Select one source-read seam

Choose the smallest credible live-read path:

- Microsoft Graph read-only delta/query path, or
- webhook-to-DO ingress if Cloudflare constraints make Graph unsuitable, or
- documented blocker proof if neither can run safely in the current Cloudflare package.

Record the choice in the task execution notes.

### 2. Preserve fact admission

Live observations must enter through the same fact/cursor/apply-log boundary created in Task 346.

They must not open work directly.

### 3. Bound the spike

The spike must support:

- one Site
- one operation/scope
- bounded record count
- no send or effect execution
- no broad credential storage redesign

### 4. Tests

Add focused tests with mocked network or fixture worker bindings proving:

- live adapter output becomes facts through the admission boundary
- duplicate live observations are idempotent
- adapter failure does not corrupt cursor/apply-log state

## Non-Goals

- Do not implement complete Microsoft Graph sync parity.
- Do not add email send or draft creation.
- Do not bypass fact admission.
- Do not claim production readiness.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] A bounded live source-read seam exists, or a concrete blocker proof exists.
- [x] Live observations route through fact/cursor/apply-log admission.
- [x] Failures do not corrupt durable admission state.
- [x] Focused tests or blocker evidence exist.
- [x] No derivative task-status files are created.

## Execution Notes

**Source-read seam choice:** HTTP polling adapter (`HttpSourceAdapter`).

Webhook ingress was considered but requires DO schema changes and fetch-handler modifications. HTTP polling needs no schema changes, fits the existing cycle step pattern, and is testable with mocked `fetch`.

**Implementation:**

1. `packages/sites/cloudflare/src/source-adapter.ts` — NEW
   - `SourceAdapter` interface: `sourceId` + `readDeltas(cursor, limit)`
   - `SourceAdapterError` — typed error for network/HTTP/parse failures
   - `HttpSourceAdapter` — generic HTTP polling adapter with custom transform support
   - Default transform requires `id` or `eventId` for fact identity; fails fast if missing

2. `packages/sites/cloudflare/src/cycle-step.ts` — MODIFIED
   - `createLiveSyncStepHandler(adapter, options?)` — step-2 handler that reads from a live adapter
   - Adapter failure is caught BEFORE any state mutation (cursor/apply-log/facts)
   - Successful deltas are admitted through the same boundary as `createSyncStepHandler`
   - Cursor updated to last delta's `eventId` (consistent with fixture handler)

3. `packages/sites/cloudflare/test/unit/live-source-adapter.test.ts` — NEW (7 tests)
   - Live adapter output becomes durable facts
   - Duplicate live observations are idempotent via apply-log
   - Network failure does not corrupt cursor/apply-log/fact state
   - HTTP error status returns failed step without state mutation
   - Custom transform support
   - Deadline exceeded before start returns skipped (adapter not called)
   - Missing identity field in adapter item returns failed step

**Also fixed:** Pre-existing type errors in `src/sandbox/charter-runtime.ts` (unused `start` variable) that were blocking `pnpm verify`.

**Verification:**
- `pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/live-source-adapter.test.ts` — 7/7 pass
- Full Cloudflare suite — 157/157 pass across 19 test files
- `pnpm verify` — 5/5 pass
