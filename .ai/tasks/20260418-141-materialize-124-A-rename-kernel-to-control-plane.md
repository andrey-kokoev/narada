# Task 141: Materialize 124-A Rename Kernel To Control-Plane

## Source

Derived from Task 124-A in `.ai/tasks/20260418-124-comprehensive-semantic-architecture-audit-report.md`.

## Why

`@narada2/kernel` currently contains most of the control-plane/runtime substrate, not just the irreducible kernel.

## Goal

Rename `@narada2/kernel` to `@narada2/control-plane` and update dependents so package names teach the architecture honestly.

## Deliverables

- package rename completed
- imports/workspace deps/docs updated
- publish/package surfaces coherent after rename

## Definition Of Done

- [ ] `@narada2/kernel` package name/path is replaced by `@narada2/control-plane`
- [ ] dependents build against the new package
- [ ] docs describe the new package name consistently
