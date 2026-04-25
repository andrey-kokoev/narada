# Task 136: Materialize 124-T Make Operation Strictly Atomic

## Source

Derived from Task 461-T in `.ai/do-not-open/tasks/20260418-461-comprehensive-semantic-architecture-audit-report.md`.

## Why

Narada's user-facing term `operation` must not be both atomic and composite.

The canonical direction is:

- 1 operation = 1 scope

Any multi-mailbox or multi-scope grouping must be a different concept, not `operation`.

## Goal

Establish `operation` as strictly atomic across canonical docs and user-facing semantics.

## Required Outcomes

### 1. Remove contradictory wording

Docs must no longer describe an operation as spanning multiple mailboxes/scopes.

### 2. Preserve 1:1 mapping

The semantic model should remain:

- user-facing `operation`
- internal `scope`
- one operation maps to one scope

### 3. Composite concepts, if needed, stay distinct

If Narada later needs grouping across operations, that must be introduced as a separate named concept.

## Deliverables

- canonical docs updated so `operation` is strictly atomic
- contradiction removed from terminology surfaces
- explicit note that any future grouping requires a separate concept

## Definition Of Done

- [x] no canonical doc describes `operation` as multi-mailbox/multi-scope
- [x] docs consistently preserve 1 operation = 1 scope
- [x] any mention of future grouping uses a distinct not-yet-implemented concept

