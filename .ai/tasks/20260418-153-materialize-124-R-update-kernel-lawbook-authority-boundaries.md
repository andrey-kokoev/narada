# Task 153: Materialize 124-R Update Kernel Lawbook Authority Boundaries

## Source

Derived from Task 124-R in `.ai/tasks/20260418-124-comprehensive-semantic-architecture-audit-report.md`.

## Why

If the authority-boundary docs lag behind runtime reality, the repo teaches incorrect law.

## Goal

Update `kernel/docs/00-kernel.md` authority boundaries so they match the current control-plane ownership model exactly.

## Deliverables

- lawbook authority section reflects current scheduler/foreman/runtime roles
- no stale boundary language remains

## Definition Of Done

- [x] `00-kernel.md` authority boundaries match current implementation
- [x] no reviewed authority contradiction remains in the lawbook

## Execution Notes

### Changes to `packages/layers/control-plane/docs/00-kernel.md` §6 Authority Boundaries

Updated all six boundaries to match the current control-plane ownership model:

1. **Foreman owns work opening** — Changed from referencing the private `onContextsAdmitted()` to the public entry points `onSyncCompleted()` / `onFactsAdmitted()`, noting both delegate to the private method.

2. **Foreman owns resolution** — Added that `resolveWorkItem()` loads the evaluation by `evaluation_id` from the coordinator store, and the runtime must persist the evaluation before calling the foreman. This reflects Task 134 (runtime-owned evaluation persistence).

3. **Scheduler owns leases** — Unchanged. Still accurate.

4. **IntentHandoff owns intent creation** — Clarified that only `IntentHandoff.admitIntentFromDecision()` may create intents, and it is called from within the foreman's atomic decision transaction. The previous wording "inside the foreman's atomic handoff" was ambiguous about who owned the intent boundary.

5. **OutboundHandoff owns command creation** — **New boundary**. Was missing from the lawbook but is a critical authority boundary in the implementation (and documented in root AGENTS.md). Mail-family outbound commands must be created inside `OutboundHandoff.createCommandFromDecision()`.

6. **Executors own mutation** — Unchanged.

7. **Charter runtime is read-only sandbox** — Added explicit notes that the runner must NOT write to coordinator or outbound stores, and does NOT own evaluation persistence. The runtime (daemon dispatch) persists evaluations before handing them to the foreman. This reflects Task 134.

## Verification

- `pnpm --filter=@narada2/control-plane typecheck` — passes
- `pnpm --filter=@narada2/control-plane test:unit` — 783 tests passed; 1 pre-existing failure in `foreman/facade.test.ts` ("downgrades low-confidence evaluation to escalation") unrelated to doc changes; V8 cleanup crash at end is known better-sqlite3 artifact
