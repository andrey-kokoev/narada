---
status: closed
created: 2026-04-24
depends_on: [575]
closed_at: 2026-04-24T16:31:46.834Z
closed_by: a3
governed_by: task_close:a3
---

# Task 576 - Dispatch Packet Session Targeting

## Goal

Extend the local dispatch surface so a dispatch record or pickup surface resolves the assigned principal's bound `kimi-cli` session and carries that targeting information forward explicitly.

## Required Work

1. Inspect the current dispatch packet / dispatch surface.
2. Add the minimum explicit session-targeting fields needed for local dispatch.
3. Resolve the target session through the principal binding registry rather than chat memory.
4. Preserve assignment/audit linkage; do not collapse dispatch into execution.
5. Add focused tests.
6. Record verification or bounded blockers.

## Acceptance Criteria

- [x] Dispatch surface carries explicit principal-session targeting data
- [x] Target resolution uses the binding registry from Task 575
- [x] Dispatch remains distinct from execution start
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

1. Examined `DispatchPacketRow` and `dispatch_packets` schema in `task-lifecycle-store.ts`.
2. Added `target_session_id` and `target_session_title` fields to `DispatchPacketRow` interface.
3. Updated `dispatch_packets` SQLite schema with the two new columns.
4. Updated `rowToDispatchPacket` and `insertDispatchPacket` to handle the new fields.
5. Exported `KimiSessionBinding`, `PrincipalSessionBindingSnapshot`, `InMemoryPrincipalSessionBindingRegistry`, and `JsonPrincipalSessionBindingRegistry` from `@narada2/control-plane` main index.
6. Updated `task-dispatch.ts` `doPickup` to:
   - Resolve principal state dir via `resolvePrincipalStateDir`
   - Load `JsonPrincipalSessionBindingRegistry` and look up agent's binding
   - Include resolved `session_id` + `session_title` in the dispatch packet
   - Return targeting info in JSON and human output
   - Gracefully handle missing/unreadable bindings (null targeting, no throw)
7. Updated `task-dispatch.ts` `doStatus` to display target session info in human output.
8. Added 3 focused tests in `task-dispatch.test.ts`:
   - Pickup includes resolved session targeting when binding exists
   - Pickup handles missing binding gracefully (null targeting)
   - Status shows session targeting in output

## Verification

- `pnpm verify`: 5/5 steps pass ✅
- `task-dispatch.test.ts`: 17/17 pass (14 existing + 3 new) ✅
- `session-binding.test.ts`: 19/19 pass (no regression) ✅
- `registry.test.ts`: 16/16 pass (no regression) ✅
- Typecheck: all 11 packages clean ✅

