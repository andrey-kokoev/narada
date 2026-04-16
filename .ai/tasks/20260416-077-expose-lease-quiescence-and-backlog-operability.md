.ai/tasks/20260416-077-expose-lease-quiescence-and-backlog-operability.md
# Task 077 — Expose Lease, Quiescence, and Backlog Operability

## Objective
Make scheduler/worker operability actually visible in the operator console.

## Why
Backend observability already computes:
- active leases
- stale lease recoveries
- quiescence indicators
- backlog-related counters

But the current API/UI do not expose them in a way operators can use.

## Required Changes
- Add observation endpoints for:
  - active leases
  - stale lease recovery events
  - quiescence indicators
  - backlog indicators by scope
- Extend worker/operability UI to show:
  - active leases with runner and expiry
  - stale lease recovery history
  - oldest active lease
  - opened / leased / executing counts
  - awaiting-retry backlog
  - “nothing moving” diagnosis hints
- Keep this view read-only

## Acceptance Criteria
- Operator can diagnose:
  - why work is stalled
  - whether leases are stuck
  - whether backlog exists without active workers
  - whether system is truly quiescent
- No force-release or force-run controls are added
- Tests cover representative lease/quiescence queries

## Invariant
Operability visibility does not become manual scheduler authority.