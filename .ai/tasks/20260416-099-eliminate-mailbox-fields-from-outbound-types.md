# Task 099 — Eliminate Mailbox Fields from Outbound Types

## Objective
Remove remaining mailbox-era fields (`conversation_id`, `mailbox_id`) from outbound TypeScript interfaces and make outbound/effect types fully neutral.

## Why
Storage and APIs are now neutral, but `OutboundCommand` (and related types) still carry mailbox-era fields in the canonical TS interface. This creates a mismatch:
- substrate = neutral
- types = partially mail-shaped

That is the last major “looks like mailbox” artifact in core data structures.

## Required Changes
- Replace mailbox-era fields with neutral equivalents:
  - `conversation_id` → `context_id`
  - `mailbox_id` → `scope_id`
- Update:
  - outbound store interfaces
  - daemon dispatch logic
  - CLI and search adapters
  - tests and fixtures
- If mailbox delivery still needs these fields:
  - map them inside mailbox adapters only
- Ensure DB compatibility views (if still present) remain consistent

## Acceptance Criteria
- No mailbox-era fields in generic outbound/effect TypeScript interfaces
- Mailbox adapters handle any required mapping explicitly
- All tests pass
- No regression in mailbox execution flows

## Invariant
Effect boundary types must be as neutral as intent itself.
