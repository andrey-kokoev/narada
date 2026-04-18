# Task 150: Materialize 124-O Register Mail Workers In Worker Registry

## Source

Derived from Task 124-O in `.ai/tasks/20260418-124-comprehensive-semantic-architecture-audit-report.md`.

## Why

If mail outbound workers remain outside the worker registry model, daemon dispatch is only partially unified.

## Goal

Register mail outbound workers in `WorkerRegistry` and make daemon dispatch use one coherent worker path.

## Deliverables

- mail workers registered through the common registry
- daemon dispatch no longer has a split worker model
- tests prove unified worker execution

## Definition Of Done

- [ ] mail outbound workers are registered in `WorkerRegistry`
- [ ] daemon dispatch uses the registry path for them
- [ ] docs/tests reflect one worker model
