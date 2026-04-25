# Task 087 — Confine Mailbox Schema to Mailbox Vertical Boundary

## Objective
Make mailbox-era schema and naming explicitly vertical-scoped so future work cannot accidentally treat them as kernel substrate.

## Why
After Task 086, the only acceptable place for mailbox-era concepts is inside the mailbox vertical boundary.

Without that explicit confinement, the repo can regress by quietly reintroducing:
- `conversation_records`
- `conversation_revisions`
- `outbound_commands`
- `conversation_id`
- `mailbox_id`

into generic logic.

## Required Changes

### 1. Reclassify mailbox-era tables and store methods as mailbox-specific

Rename or document mailbox-era artifacts as mailbox-boundary concepts where practical.

Examples:
- mailbox-specific compatibility tables/views
- mailbox-specific delivery/adaptation functions
- mailbox-only type aliases or adapters

### 2. Restrict generic modules from referencing mailbox-era durable schema

Generic modules must not directly depend on:
- `conversation_records`
- `conversation_revisions`
- `outbound_commands`
- `conversation_id`
- `mailbox_id`

except through mailbox vertical modules or explicit compatibility adapters.

### 3. Add architectural tests/grep guards

Add CI checks that fail if generic modules reference mailbox-era schema names outside allowed locations.

### 4. Update docs and AGENTS guidance

State explicitly:
- mailbox schema is vertical-local
- neutral schema is kernel/generic
- mailbox compatibility is additive, not foundational

## Acceptance Criteria

- Generic modules cannot directly import or query mailbox-era durable schema
- Mailbox schema references are isolated to mailbox vertical modules and explicit compatibility boundaries
- CI fails on new mailbox leakage into generic durable/query/store layers
- Docs clearly distinguish kernel substrate from mailbox boundary

## Invariant

Mailbox schema is vertical-local historical compatibility, not kernel truth.