---
closes_tasks: [573]
decided_at: 2026-04-24
decided_by: a2
reviewed_by: a2
governance: derive -> propose
---

# Decision 573 — Assignment Dispatch Chapter Closure

## Status

Chapter 570–573 is closed. The dispatch zone is defined, the packet/pickup contract is specified, and a bounded local dispatch surface exists in code.

---

## What This Chapter Produced

### Task 570 — Dispatch Zone Boundary Contract

**Artifact:** `.ai/decisions/20260424-570-dispatch-zone-boundary-contract.md`

- Defined **Dispatch Zone** as a first-class zone between Assignment and Execution
- Three-zone model: Assignment → Dispatch → Execution
- Zone ownership tables (what each zone owns and does NOT own)
- Two six-field crossing regime declarations:
  - Assignment → Dispatch
  - Dispatch → Execution
- Five invariants (at-most-one active packet, bounded lease, re-dispatch rules, read-only spec, idempotent pickup)
- Rationale for why assignment alone is insufficient (authority collapse, no timeout, no context, no re-dispatch, control-plane analogy)

### Task 571 — Dispatch Packet And Pickup Contract

**Artifact:** `.ai/decisions/20260424-571-dispatch-packet-and-pickup-contract.md`

- `DispatchPacket` interface (11 fields) with identity format `disp_{task_id}_{assignment_id}_{seq}`
- `DispatchContext` interface (7 fields) — read-only execution context snapshot
- Visibility rules (4 conditions for queue entry)
- Admissibility rules (5 conditions for pickup)
- Pickup effects and auto-creation on claim semantics
- Lease lifecycle: constants (30 min default, 15 min extension, 4 hr max), heartbeat, expiry, release, superseded
- Re-dispatch rules: same-agent and takeover paths
- Ack/lease/takeover posture with comparison table
- Operator surfaces and intervention actions
- SQLite schema for `dispatch_packets` table + 4 indexes

### Task 572 — Local Dispatch Surface v0

**Files:**
- `packages/layers/cli/src/commands/task-dispatch.ts` — CLI dispatch command
- `packages/layers/cli/src/lib/task-lifecycle-store.ts` — extended with dispatch packet support
- `packages/layers/cli/src/main.ts` — wired `narada task dispatch <action>`
- `packages/layers/cli/test/commands/task-dispatch.test.ts` — 14 tests

**CLI surface:**
```bash
narada task dispatch queue --agent <id>
narada task dispatch pickup <task> --agent <id>
narada task dispatch status <task>
```

**Store additions:**
| Method | Description |
|--------|-------------|
| `insertDispatchPacket()` | Create pickup record |
| `getActiveDispatchPacketForAssignment()` | Get current active packet |
| `getDispatchPacketsForTask()` | Get all packets for a task |
| `getDispatchPacketsForAgent()` | Get all packets for an agent |
| `heartbeatDispatchPacket()` | Extend lease with capping |
| `updateDispatchStatus()` | Transition packet status |

---

## Settled Doctrine

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Dispatch zone declared | ✅ | Decision 570 defines three-zone model with authority owners |
| Crossing regimes defined | ✅ | Two six-field regime declarations in Decision 570 |
| Packet shape defined | ✅ | Decision 571 defines `DispatchPacket` + `DispatchContext` |
| Pickup semantics defined | ✅ | Visibility, admissibility, pickup effects in Decision 571 |
| Lease lifecycle defined | ✅ | Heartbeat, expiry, release, superseded in Decision 571 |
| Local surface exists | ✅ | CLI `task dispatch` command in Task 572 |
| Tests exist | ✅ | 14 tests in `task-dispatch.test.ts` |
| SQLite schema exists | ✅ | `dispatch_packets` table with indexes in Task 572 |
| Heartbeat capping | ✅ | `heartbeatDispatchPacket` implements max lease cap |
| Operator visibility | ✅ | `status`, `queue` actions show dispatch state |

---

## Deferred Gaps

| Item | Why Deferred |
|------|-------------|
| **Heartbeat daemon** | Requires background process or cron; expiry is passive for v0 |
| **Auto-dispatch on claim** | Flag exists in contract but not wired into `task-claim` yet |
| **Assignment migration to SQLite** | Assignments still in JSON; `assignment_id` FK deferred |
| **Full `DispatchContext` assembly** | Context snapshot partially implemented; dependency statuses and review findings not yet assembled |
| **Operator intervention commands** | Force expiry, force release defined in contract but not implemented |
| **Crossing regime inventory entry** | Will be added when dispatch crossings have runtime consumers beyond CLI |
| **Workbench dispatch pane** | UI rendering deferred |
| **Remote/distributed dispatch** | Explicitly out of scope for v0; local surface only |

---

## Residual Risks

1. **JSON assignment drift.** Assignments are still in JSON files while dispatch packets are in SQLite. If the JSON and SQLite diverge (e.g., assignment released in JSON but packet still active in SQLite), the dispatch surface may show inconsistent state. Mitigation: both are read from the same filesystem; the risk is bounded to concurrent mutations.
2. **Lease expiry is passive.** Without a daemon, expired packets remain in `picked_up` status until explicitly queried. The next query classifies them as expired, but no automatic re-dispatch occurs.
3. **Assignment ID proxy.** For v0, `claimed_at` is used as `assignment_id` proxy because assignments haven't been migrated to SQLite. This means two assignments with the same `claimed_at` (highly unlikely) would collide.
4. **Context snapshot staleness.** `DispatchContext` is assembled at pickup time. If the task markdown or SQLite state changes after pickup, the agent's context snapshot becomes stale. The agent can re-read the task file at any time.

---

## Verification Evidence

- `pnpm verify`: 5/5 steps pass ✅
- `pnpm typecheck`: all 11 packages clean ✅
- `task-dispatch.test.ts`: 14/14 pass ✅
- `task-lifecycle-store.test.ts`: 27/27 pass ✅
- `task-close.test.ts`: 19/19 pass ✅

---

## Closure Statement

Chapter 570–573 closes with a defined dispatch zone, a specified packet/pickup contract, and a real CLI dispatch surface. The three-zone model (Assignment → Dispatch → Execution) is now a first-class part of Narada task governance. The local dispatch surface allows agents to observe their queue, pick up work with lease semantics, and check dispatch status. Deferred work (heartbeat daemon, assignment migration, operator interventions, workbench pane) is explicitly catalogued for subsequent chapters.

---

**Closed by:** a2  
**Closed at:** 2026-04-24
