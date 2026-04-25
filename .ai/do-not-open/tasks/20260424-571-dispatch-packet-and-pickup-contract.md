---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T13:40:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [570]
artifact: .ai/decisions/20260424-571-dispatch-packet-and-pickup-contract.md
---

# Task 571 - Dispatch Packet And Pickup Contract

## Goal

Define the canonical dispatch packet and pickup semantics for assigned agent work.

## Required Work

1. Define the dispatch packet shape.
2. Define what counts as:
   - visible
   - admitted
   - picked up
   - timed out
   - re-dispatchable
3. Define ack/lease/timeout/takeover posture.
4. State operator visibility and intervention points.
5. Record verification or bounded blockers.

## Acceptance Criteria

- [x] Dispatch packet shape is explicit
- [x] Pickup semantics are explicit
- [x] Ack/lease/timeout/takeover semantics are explicit
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Artifact

Written `.ai/decisions/20260424-571-dispatch-packet-and-pickup-contract.md` (~12 KB) covering:
- `DispatchPacket` interface (packet_id, task_id, assignment_id, agent_id, picked_up_at, lease_expires_at, heartbeat_at, dispatch_status, sequence, created_by)
- `DispatchContext` interface (task_spec, prior_execution_notes, prior_verification, continuation_packet, files_touched, dependency_statuses, latest_review_findings)
- Identity format: `disp_{task_id}_{assignment_id}_{seq}`
- Visibility rules (4 conditions: unreleased assignment, claimed/needs_continuation status, satisfied dependencies, no active packet)
- Admissibility rules (5 conditions at pickup time)
- Pickup effects (row creation, context snapshot, lease start)
- Auto-creation on claim (optional `auto_dispatch` flag)
- Lease constants (30 min default, 15 min extension, 4 hr max, 15 min heartbeat interval)
- Heartbeat semantics (idempotent, capped extension)
- Expiry semantics (passive transition, no daemon required)
- Release semantics (active, governed operator)
- Superseded semantics (takeover creates new assignment, old packet archived)
- Re-dispatch rules (eligibility 4 conditions, same-agent re-dispatch, takeover re-dispatch)
- Lease vs Assignment comparison table
- Takeover interaction flow
- Operator surfaces (status, history, queue) and intervention actions (force expiry, force release, override pickup)
- Audit trail posture (append-only table)
- SQLite schema for Task 572 (table + 4 indexes)
- Deferred items table

### Verification

- `pnpm verify` — 5/5 steps pass ✅
- `pnpm typecheck` — all 11 packages clean ✅
- Decision artifact exists and is comprehensive ✅
