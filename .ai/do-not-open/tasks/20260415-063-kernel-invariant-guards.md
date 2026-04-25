# Task 063 — Kernel Invariant Guards

## Objective
Prevent regression into mailbox-coupled design.

## Required Changes
- Add tests/lints that fail if kernel modules reference:
  - `conversation_id`
  - `thread_id`
  - Graph-specific types
- Restrict such usage to mailbox vertical modules only

## Acceptance Criteria
- CI fails on kernel-layer mailbox leakage

## Invariant
Kernel must remain domain-neutral