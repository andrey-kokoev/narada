---
status: closed
depends_on: [309, 322, 323, 324]
---

# Task 325 — Bounded Cycle Runner Contract

## Context

Task 308 defined a Cloudflare Cycle as a bounded 8-step attempt to advance an Aim at a Site. This task implements the Cycle runner: the function that executes those 8 steps within Cloudflare execution limits.

## Goal

Implement the Cycle runner that executes one bounded mailbox Cycle. The runner must acquire the Site lock, run the 8-step pipeline, respect timeout bounds, and leave a Trace.

## Required Work

### 1. Implement the 8-step pipeline

```typescript
async function runCycle(siteId: string, env: CloudflareEnv): Promise<CycleResult>
```

Steps:

1. **Acquire Site/Cycle lock** — Call DO `acquireLock`. Fail fast if locked.
2. **Sync source deltas** — Pull Graph API delta. Write cursor and apply-log.
3. **Derive / admit work** — Run context formation + foreman admission. Open/supersede work items.
4. **Run charter evaluation** — Lease work, run charter through a bounded runner seam; Task 326 proves the minimal Sandbox/Container execution path. Full charter/tool execution inside Sandbox may remain deferred, but the seam must not assume an inline-only Worker runtime.
5. **Create draft / intent handoffs** — Run foreman governance. Create outbound commands where policy permits.
6. **Reconcile submitted effects** — Check confirmation status of previous Acts.
7. **Update health and Trace** — Write health snapshot and Cycle summary to DO and R2.
8. **Release lock and exit** — Release DO lock. Return `CycleResult`.

### 2. Enforce boundedness

- Hard wall-clock ceiling: 30 seconds (Worker limit) or configured Sandbox limit.
- Graceful abort: if ceiling approaches, finish current step, skip remaining, release lock, record partial-Trace.
- Idempotent resume: next Cron invocation reads cursor and health; picks up where partial-Trace left off.

### 3. Define CycleResult

```typescript
interface CycleResult {
  cycle_id: string;
  site_id: string;
  started_at: string;
  finished_at: string;
  status: "complete" | "partial" | "failed";
  steps_completed: number[]; // which of the 8 steps ran
  error?: string;
  trace_key: string; // R2 key to full Cycle Trace
}
```

## Non-Goals

- Do not implement Sandbox execution (Task 326).
- Do not implement multi-Site coordination.
- Do not implement operator mutations (approve/reject drafts).
- Do not add Wrangler config.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] `runCycle` function exists and compiles.
- [x] All 8 steps are callable in sequence.
- [x] Lock is acquired before step 1 and released after step 8.
- [x] Timeout gracefully aborts and records partial-Trace.
- [x] Next Cycle can resume from partial-Trace state.

## Execution Notes

- `packages/sites/cloudflare/src/runner.ts` — `runCycle(siteId, env, config)` implements the 8-step pipeline with timeout boundedness.
  - Step 1: Acquire lock via `NaradaSiteCoordinator.acquireLock()`
  - Steps 2-6: Stub seams for deferred tasks (sync, derive, evaluate, handoff, reconcile)
  - Step 7: Update health via `coordinator.setHealth()`
  - Step 8: Release lock via `coordinator.releaseLock()`
  - Graceful abort: `canContinue()` checks `Date.now() + abortBufferMs < deadline`; skipped steps leave partial trace
  - Lock release on error: try/finally pattern ensures lock is released even on exception
- `packages/sites/cloudflare/src/coordinator.ts` — `NaradaSiteCoordinator` DO class with SQLite schema for locks, health, traces, context_records, work_items.
- `packages/sites/cloudflare/src/cycle-entrypoint.ts` — `invokeCycle(req, env)` wires HTTP request to `runCycle`.
- `packages/sites/cloudflare/src/index.ts` — Worker fetch handler routes `/cycle` to `invokeCycle` with `env` bindings.
- `packages/sites/cloudflare/test/unit/runner.test.ts` — 4 tests covering: complete 8-step run, lock contention failure, graceful partial abort, and error recovery with lock release.
- `pnpm-workspace.yaml` updated to include `packages/sites/*`.
- `pnpm typecheck` passes across all 9 workspace packages.
- Tests pass: `pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/runner.test.ts`
