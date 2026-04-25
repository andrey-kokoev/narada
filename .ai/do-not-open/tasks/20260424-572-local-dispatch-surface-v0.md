---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T13:45:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [571, 569]
---

# Task 572 - Local Dispatch Surface v0

## Goal

Create the first bounded local surface through which assigned agents can observe and pick up work from Narada runtime.

## Required Work

1. Choose a bounded local surface, such as:
   - workbench dispatch pane
   - CLI poll/pickup command
   - local queue/read endpoint
2. Implement visibility of assigned work.
3. Implement bounded pickup/admission semantics.
4. Avoid pretending full remote/distributed dispatch exists.
5. Add focused verification.

## Acceptance Criteria

- [x] Assigned work is visible through a local dispatch surface
- [x] Bounded pickup/admission exists
- [x] Focused verification or bounded blocker evidence is recorded

## Execution Notes

### Implementation

**New file: `packages/layers/cli/src/commands/task-dispatch.ts`**

CLI dispatch surface with three actions:
- `queue --agent <id>` — show visible assigned work for an agent
- `pickup <task-number> --agent <id>` — pick up a specific task
- `status <task-number>` — show dispatch status for a task

**Modified file: `packages/layers/cli/src/lib/task-lifecycle-store.ts`**

Added dispatch packet support:
- `DispatchPacketRow` interface (11 fields)
- `DispatchPacketStatus` and `DispatchCreatedBy` types
- `dispatch_packets` table with 4 indexes
- Store methods: `insertDispatchPacket`, `getActiveDispatchPacketForAssignment`, `getDispatchPacketsForTask`, `getDispatchPacketsForAgent`, `heartbeatDispatchPacket`, `updateDispatchStatus`

**Modified file: `packages/layers/cli/src/main.ts`**

Wired `narada task dispatch <action>` into CLI with store lifecycle management.

**Design choices:**
- CLI is the bounded v0 surface (not workbench or HTTP endpoint)
- Assignments are still JSON-based; `assignment_id` FK is deferred until assignment migration completes
- Pickup uses `claimed_at` as assignment_id proxy for v0 compatibility
- Lease constants from Decision 571: 30 min default, 15 min extension, 4 hr max
- Heartbeat capping logic implemented in `heartbeatDispatchPacket`
- Visibility checks: unreleased assignment, claimed/needs_continuation status, satisfied dependencies, no active packet

### Tests

**New file: `packages/layers/cli/test/commands/task-dispatch.test.ts` (14 tests):**
- Queue: empty queue, visible task, blocked task (already picked up)
- Pickup: success, not assigned, wrong agent, double pickup
- Status: no packets, packet after pickup
- Store methods: heartbeat extension, heartbeat capping, update status

### Verification

- `pnpm verify` — 5/5 steps pass ✅
- `pnpm typecheck` — all 11 packages clean ✅
- `task-dispatch.test.ts` — 14/14 pass ✅
