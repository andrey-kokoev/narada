---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T13:50:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [556, 569]
owner: codex
---

# Task 570-573 - Assignment Dispatch And Agent Work Pickup

## Goal

Define and begin implementing the runtime zone between assignment and execution so Narada can cause assigned agents to actually pick up work without relying on manual chat relay.

## Chapter DAG

```text
570 Dispatch Zone Boundary Contract
571 Dispatch Packet And Pickup Contract
572 Local Dispatch Surface v0
570, 571, 572 ─→ 573 Assignment Dispatch Chapter Closure
```

## Tasks

| Task | Title | Purpose |
|------|-------|---------|
| 570 | Dispatch Zone Boundary Contract | Define assignment -> dispatch -> execution as distinct zones/crossings |
| 571 | Dispatch Packet And Pickup Contract | Define the packet, admission, ack, lease, and timeout semantics |
| 572 | Local Dispatch Surface v0 | Create the first bounded local surface for assigned agents to observe/pick up work |
| 573 | Assignment Dispatch Chapter Closure | Close the chapter honestly |

## Closure Criteria

- [x] Dispatch/work pickup is defined as a distinct zone
- [x] Assignment-to-dispatch and dispatch-to-execution crossings are explicit
- [x] Dispatch packet / pickup semantics are defined
- [x] A bounded local dispatch surface exists or bounded blockers are recorded
- [x] Verification or bounded blockers are recorded
