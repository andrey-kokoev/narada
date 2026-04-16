# Task 086 — Replace Mailbox-Era Base Tables with Neutral Durable Models

## Objective

Complete the de-mailboxing effort by replacing mailbox-era base tables with truly neutral durable tables, instead of continuing to project neutral compatibility views over mailbox-shaped storage.

## Why

Task 082 successfully introduced neutral observation-facing compatibility views:

- `context_records` over `conversation_records`
- `context_revisions` over `conversation_revisions`
- `outbound_handoffs` over `outbound_commands`

That was the correct transitional move.

However, the underlying durable substrate is still mailbox-era:

- `upsertContextRecord()` still writes into `conversation_records`
- `recordContextRevision()` still writes into `conversation_revisions`
- `outbound_handoffs` is still a view over `outbound_commands`

So the repo now has **neutral semantics over non-neutral storage**.

That is acceptable as a bridge, but not as terminal architecture.

## Goal

Make neutral durable models the real base layer for:

- contexts
- context revisions
- outbound/effect handoffs

Mailbox-specific concepts must become a vertical-specific layer above that substrate, not the physical schema underneath it.

## Required Changes

### 1. Introduce neutral base tables

Create durable base tables for at least:

- `context_records_base` (or `context_records` if taking final naming directly)
- `context_revisions_base`
- `outbound_handoffs_base`

Use neutral field names:

- `context_id`
- `scope_id`

Do not require:

- `conversation_id`
- `mailbox_id`

### 2. Migrate coordinator store writes to neutral base tables

Refactor:

- `upsertContextRecord()`
- `getContextRecord()`
- `recordContextRevision()`
- related read paths

so they operate on neutral base tables directly.

### 3. Migrate outbound observation-facing durable state to neutral base tables

Refactor observation-facing outbound summary queries so they read neutral durable handoff state directly rather than through `outbound_handoffs` compatibility view over `outbound_commands`.

If mailbox delivery still requires `outbound_commands` internally, isolate that as vertical-specific delivery state.

### 4. Preserve mailbox compatibility through adapters/views only where needed

If legacy mailbox logic still needs old table names for a transitional period:

- keep compatibility views or adapters
- but make them flow _from_ neutral base tables, not the reverse

### 5. Update query helpers and store interfaces

Ensure generic observation/query layers:

- read neutral base tables
- no longer depend on mailbox-era source tables
- preserve existing behavior for mailbox vertical pages

### 6. Add migration path

Add an explicit migration strategy for existing data:

- copy or transform mailbox-era rows into neutral base tables
- preserve replay/idempotency invariants
- keep migration deterministic

### 7. Add tests

Add tests proving:

- context writes/readbacks use neutral base tables
- non-mail fixtures do not transit through mailbox-era tables
- mailbox compatibility still works
- generic observation pages remain unchanged in behavior
- legacy compatibility layer, if retained, is one-way from neutral → mailbox compatibility, not mailbox → neutral

## Acceptance Criteria

- Neutral durable tables are the actual source of truth for generic context/revision/outbound handoff data
- Generic observation queries do not depend on mailbox-era base tables
- Non-mail context fixtures can be inserted without touching mailbox-era tables
- Mailbox-specific features remain functional through compatibility boundaries
- Migration tests pass

## Invariant

Neutral semantics must be backed by neutral storage.
Compatibility layers may remain, but they must point outward from neutral durable truth, never inward to recover it.
