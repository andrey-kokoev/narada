# First-Class Narada Runtime Concepts

## Purpose

This document is the coordination ledger for Narada runtime concepts that have crossed the threshold from incidental implementation detail into first-class product/system objects.

It does not replace narrower contracts. It records the first-class object, the authority contract, the current implementation posture, and remaining implementation work for each slice.

## Rule

A concept is first-class when operators, agents, tests, and implementation packages need to refer to it by stable name and boundary. If the same shape keeps reappearing across launch, NARS, MCP, delegation, projection, and task lifecycle surfaces, it must be named instead of rediscovered through local code paths.

## 1549 - NARS Session Management

CL: 0.995

First-class object: Site-local NARS session index, liveness, discovery, attach, and recovery.

Authority contracts:

- [`nars-session-management.md`](nars-session-management.md)
- [`nars-runtime-contract.md`](nars-runtime-contract.md)

Current implementation posture:

- NARS session discovery has a dedicated Site-local storage contract under `.narada/crew/nars-sessions/<session-id>/`.
- Per-session records, heartbeat files, event logs, and aggregate indexes are named as discovery projections rather than runtime authority.
- Attach semantics are endpoint-based at the low level and discovery-based through Narada CLI at higher levels.
- Liveness authority comes from `/health` or `session.health`, not from `status_hint`, terminal windows, or ambient process guesses.

Remaining implementation work:

- Continue hardening stale and ambiguous session UX in attach commands.
- Keep extraction boundaries clear while helpers still live partly under `@narada2/carrier-runtime`.
- Preserve compatibility fields such as `carrier_session_id` without letting clients infer that `carrier_` means `agent-cli` ownership.

Acceptance coverage:

- A reviewer can find the authoritative session management contract from this ledger and the linked docs.
- Current implementation gaps are recorded explicitly above.
- The target attach model is not dependent on terminal windows or ambient runtime state.
