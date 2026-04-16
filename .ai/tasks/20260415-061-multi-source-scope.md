# Task 061 — Multi-Source Scope Semantics

## Objective
Support multiple sources contributing to same scope with consistent checkpointing.

## Required Changes
- Allow multiple `Source` instances per `scope_id`
- Define merge semantics for:
  - checkpoints
  - fact streams
- Ensure deterministic replay

## Acceptance Criteria
- Multiple sources feed same context correctly
- No duplication or ordering corruption

## Invariant
Scope is first-class boundary, not source