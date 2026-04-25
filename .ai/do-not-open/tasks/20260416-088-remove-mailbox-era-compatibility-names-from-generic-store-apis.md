# Task 088 — Remove Mailbox-Era Compatibility Names from Generic Store APIs

## Objective
Eliminate mailbox-era naming from generic/public store APIs now that neutral durable tables are the real substrate.

## Why
Task 086 completed the important architectural crossing:
- `context_records` / `context_revisions` are now physical neutral base tables
- `outbound_handoffs` is now the physical neutral outbound base table

However, compatibility-era API names still remain in generic surfaces, for example:
- `upsertConversationRecord`
- `getConversationRecord`
- `getActiveCommandsForThread`

Those names preserve historical convenience, but they continue to leak mailbox ontology into the public store contract.

## Required Changes

### 1. Promote neutral API names to primary contract
Introduce or standardize on neutral names such as:
- `upsertContextRecord`
- `getContextRecord`
- `getActiveCommandsForContext`

### 2. Demote mailbox-era names to compatibility wrappers
Keep mailbox-era names only as compatibility wrappers where still needed.
Mark them clearly as mail-vertical compatibility APIs.

### 3. Refactor internal generic call sites
Update generic/kernel call sites to use only neutral API names.

### 4. Keep mailbox vertical functioning
Mailbox-specific modules may still use compatibility wrappers temporarily, but only inside clearly mail-scoped code.

### 5. Add tests
Add tests proving:
- generic modules compile and run without mailbox-era API names
- compatibility wrappers still behave correctly
- no behavior changes in mailbox flows

## Acceptance Criteria
- Generic store interfaces expose neutral names as the primary contract
- Mailbox-era compatibility names are isolated, documented, and non-primary
- No generic module depends on mailbox-era API names
- Tests pass

## Invariant
Now that neutral storage is truth, generic APIs must speak neutral language.