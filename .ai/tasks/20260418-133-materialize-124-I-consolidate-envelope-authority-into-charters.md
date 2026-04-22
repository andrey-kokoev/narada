# Task 133: Materialize 124-I Consolidate Envelope Authority Into Charters

## Source

Derived from Task 461-I in `.ai/tasks/20260418-461-comprehensive-semantic-architecture-audit-report.md`.

## Why

Narada's charter invocation/output contract should have exactly one canonical owner.

The current intended direction is that `@narada2/charters` owns:

- invocation/output envelope schemas
- runtime envelope validation
- the corresponding TypeScript contract surface

Any remaining kernel-local parallel ownership keeps this boundary fragile.

## Goal

Make `@narada2/charters` the single authority for charter invocation/output contract types and validation.

## Required Outcomes

### 1. Charters owns the canonical contract

The canonical source of truth for:

- `CharterInvocationEnvelope`
- `CharterOutputEnvelope`
- associated sub-types used by those envelopes

must live in `@narada2/charters`.

### 2. Kernel stops acting as a parallel authority

Kernel may:

- import these types
- re-export them for convenience

Kernel must not maintain competing first-class definitions for the same invocation/output contract.

### 3. Validation authority is singular

Validation of the runtime envelope contract must be grounded in the charters-owned schemas, not duplicated validation authorities.

### 4. Downstream imports stay coherent

Any kernel, daemon, or test code that relies on these types should import from the charters-owned surface directly or through a clearly documented kernel re-export.

## Deliverables

- one canonical envelope authority in `@narada2/charters`
- removal/reduction of parallel kernel ownership
- updated imports/re-exports/docs reflecting the final authority boundary

## Definition Of Done

- [ ] `@narada2/charters` is the single canonical owner of invocation/output envelope contract types
- [ ] kernel no longer acts as a parallel type/schema authority for that same contract
- [ ] imports/re-exports/docs all reflect the chosen authority cleanly

