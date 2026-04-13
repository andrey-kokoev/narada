# Outbound SQLite Store

## Mission
Implement the first real persistence layer for the outbound subsystem using the canonical SQLite schema, with a small API that supports command creation, versioning, transition logging, and worker eligibility queries.

## Scope
`packages/exchange-fs-sync/src/outbound/`
`packages/exchange-fs-sync/test/unit/outbound/`

## Why This Is Next
The types and schema exist, but there is no code that actually uses them. The store is the boundary that turns the outbound model into a durable subsystem.

## Deliverables

### 1. Store Module

Create a store module such as:

`src/outbound/store.ts`

Provide a small, explicit API for:

- initializing schema
- creating an outbound command plus version
- appending transitions
- reading latest version for an `outbound_id`
- marking prior unsent version as `superseded`
- fetching next eligible command for a mailbox or globally
- persisting managed draft metadata

### 2. Uniqueness Enforcement

Enforce the invariant:

- at most one active unsent command per `(thread_id, action_type)`

Decide whether enforcement lives in:

- SQL constraints plus partial indexes, or
- transactional application logic

Document the choice in code comments and tests.

### 3. Transactional Semantics

All state updates that change command status and transition history should be atomic:

- command row update
- version row update if needed
- transition append

### 4. Store Tests

Add tests for:

- command creation
- version supersession
- invalid uniqueness conflicts
- transition append behavior
- next-eligible selection
- managed draft persistence

## Definition Of Done

- [ ] outbound store module exists
- [ ] schema initialization is executable from code
- [ ] active-unsent uniqueness is enforced
- [ ] transitions are persisted atomically
- [ ] store tests cover the public API
- [ ] `pnpm test` passes

