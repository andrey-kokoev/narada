# Task 058 — Filesystem Vertical Proof

## Objective
Implement filesystem as a first-class vertical to validate kernel neutrality.

## Required Changes
- Implement `FilesystemSource`
- Emit facts:
  - `filesystem.change`
- Implement:
  - FilesystemContextStrategy
  - FilesystemContextMaterializer
- Add example policy → process execution

## Acceptance Criteria
- End-to-end: file change → fact → work → intent → process execution
- No mailbox involvement

## Invariant
Kernel must operate identically across verticals