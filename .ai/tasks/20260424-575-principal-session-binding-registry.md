---
status: closed
created: 2026-04-24
depends_on: [573, 574]
closed_at: 2026-04-24T16:21:26.178Z
closed_by: a3
governed_by: task_close:a3
---

# Task 575 - Principal Session Binding Registry

## Goal

Implement the local runtime registry that binds Narada principals such as `a1`–`a6` to the concrete `kimi-cli` session handle Narada should target during dispatch.

## Required Work

1. Introduce the concrete binding type and local persistence surface defined by Task 574.
2. Implement load/save/query helpers for principal-to-session bindings.
3. Keep the authoritative handle choice aligned with the contract:
   - operational session handle
   - human-readable advisory title when present
4. Preserve bounded failure behavior:
   - missing binding
   - stale binding
   - corrupt binding state
5. Add focused tests.
6. Record verification or bounded blockers.

## Acceptance Criteria

- [x] Principal-to-session binding registry exists in local runtime state
- [x] Binding read/write helpers are implemented and tested
- [x] Missing/stale/corrupt binding behavior is explicit and tested or bounded
- [x] No config/global session shortcut regresses multi-principal targeting
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

1. Read Decision 574 contract to understand binding model, canonical handle choice, storage location, and failure handling.
2. Examined existing `PrincipalRuntimeRegistry` pattern in `packages/layers/control-plane/src/principal-runtime/` for consistency.
3. Created `packages/layers/control-plane/src/principal-runtime/session-binding.ts` with:
   - `KimiSessionBinding` interface matching Decision 574 contract
   - `PrincipalSessionBindingSnapshot` interface for serialization
   - `InMemoryPrincipalSessionBindingRegistry` — in-memory store with get/set/remove/list/resolve/has/count
   - `JsonPrincipalSessionBindingRegistry` — JSON-backed persistence with same interface
   - `isValidBinding()` guard to reject corrupt records during load
4. Updated `packages/layers/control-plane/src/principal-runtime/index.ts` to export new types and registries.
5. Added `packages/layers/control-plane/test/unit/principal-runtime/session-binding.test.ts` with 19 tests covering:
   - In-memory CRUD, resolve, overwrite, removal, existence check
   - JSON load from file, persist after set/remove
   - Corrupt file handling (invalid JSON, non-object JSON)
   - Invalid binding skipping during load
   - Custom filename support
   - Missing directory auto-creation
6. Verified no config/global session shortcuts were modified — `charter.session_id` remains untouched.

## Verification

- `pnpm verify`: 5/5 steps pass ✅
- `pnpm typecheck`: all 11 packages clean ✅
- `session-binding.test.ts`: 19/19 pass ✅
- `registry.test.ts`: 16/16 pass (no regression) ✅


