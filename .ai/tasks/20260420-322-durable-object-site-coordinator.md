---
status: closed
depends_on: [309, 320, 321]
---

# Task 322 — Durable Object Site Coordinator: Lock, Health, and Compact State

## Context

Task 308 identified the Durable Object as the per-Site coordination point: it holds the exclusive Cycle lock, health records, and compact SQLite control state. This task implements that skeleton.

## Goal

Implement the Durable Object class that acts as the Site coordinator. It must support lock acquisition, health read/write, and compact SQLite schema for control-plane state.

## Required Work

### 1. Implement the DO class

Create a Durable Object class (e.g., `NaradaSiteCoordinator`) with methods:

- `acquireLock(cycleId: string, ttlMs: number): { acquired: boolean; previousCycleId?: string }`
- `releaseLock(cycleId: string): void`
- `getHealth(): SiteHealthRecord`
- `setHealth(health: SiteHealthRecord): void`
- `getLastCycleTrace(): CycleTraceRecord | null`
- `setLastCycleTrace(trace: CycleTraceRecord): void`

### 2. Define SQLite schema inside the DO

The DO uses Durable Object SQLite for compact control state. Initialize tables:

- `site_locks` — active Cycle lock
- `site_health` — last health snapshot
- `cycle_traces` — summary of recent Cycles
- `context_records` — minimal context metadata
- `work_items` — minimal work item state

These are **compact** shadows of the full coordinator schema. Full state may live in R2 (Task 323) for recovery/rebuild.

### 3. Enforce lock semantics

- Only one Cycle may hold the lock at a time.
- Lock must auto-expire after `ttlMs` to prevent stuck Cycles.
- Re-acquisition by the same `cycleId` is idempotent.

## Non-Goals

- Do not implement full foreman governance logic.
- Do not implement Cycle execution (Task 325).
- Do not implement R2 storage (Task 323).
- Do not add Wrangler config.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] DO class compiles and exports correctly.
- [x] Lock acquire/release works across multiple Worker invocations.
- [x] Health records survive DO hibernation.
- [x] SQLite schema initializes on first access.
- [x] Lock TTL prevents indefinite stuck locks.

## Suggested Verification

```bash
pnpm --filter <worker-package> typecheck
pnpm test:focused "pnpm --filter <worker-package> exec vitest run test/unit/site-coordinator.test.ts"
```

Use a mock DO environment or in-memory SQLite for unit tests.

## Execution Notes

Task completed prior to Task 474 closure invariant. `NaradaSiteCoordinator` Durable Object class implemented in `packages/sites/cloudflare/src/coordinator.ts` with `acquireLock`, `releaseLock`, `getHealth`, `setHealth`, `getLastCycleTrace`, `setLastCycleTrace`. SQLite schema initializes `site_locks`, `site_health`, `cycle_traces`, `context_records`, and `work_items` tables. Lock TTL prevents stuck locks.

## Verification

Verified by inspecting `packages/sites/cloudflare/src/coordinator.ts`. Lock acquire/release tested via `packages/sites/cloudflare/test/coordinator.test.ts`.
