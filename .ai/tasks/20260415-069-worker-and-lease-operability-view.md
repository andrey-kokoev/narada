# Task 069 — Worker and Lease Operability View

## Objective
Expose scheduler/worker health without giving UI control authority.

## Required Changes
- Add views for:
  - active leases
  - stale lease recovery events
  - worker registry entries
  - worker concurrency policy
  - active process executions
- Show quiescence/backlog indicators

## Acceptance Criteria
- Operator can diagnose “why is nothing moving?” and “what is currently running?”
- No force-release / force-run controls yet

## Invariant
Operability visibility must not become manual authority