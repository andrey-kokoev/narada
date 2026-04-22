# Task 148: Materialize 124-M Resolve Charter Outputs Table Fate

## Source

Derived from Task 461-M in `.ai/tasks/20260418-461-comprehensive-semantic-architecture-audit-report.md`.

## Why

`charter_outputs` currently represents unclear authority: either it is durable product state or dead residue.

## Goal

Choose one path for `charter_outputs`: revive it coherently or remove it and migrate reads to `evaluations`.

## Deliverables

- explicit decision on `charter_outputs`
- code/schema/observability aligned with that decision
- no half-alive table remains

## Definition Of Done

- [ ] `charter_outputs` has a clear status: active or removed
- [ ] read/write paths match that status
- [ ] observability surfaces no longer depend on ambiguous schema residue
