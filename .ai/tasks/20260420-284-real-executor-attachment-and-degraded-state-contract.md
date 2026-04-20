# Task 284: Real Executor Attachment and Degraded-State Contract

## Chapter

Operation Realization

## Context

Narada can already govern work and produce draft-oriented outcomes, but the product still needs a canonical account of how a real executor is attached and how degraded states are expressed when parts of that path are missing or unhealthy.

## Goal

Make the real executor path explicit, inspectable, and safe, with a first-class degraded-state contract.

## Required Work

### 1. Canonical Executor Path

Define and implement the expected path from operation config to real charter execution:

- configured charter runtime
- runtime availability checks
- invocation path
- draft-first effect boundary

### 2. Degraded-State Classes

Distinguish at least:

- not configured enough to run
- runnable in safe/draft mode
- partially degraded but still inspectable
- broken and requiring operator intervention

These classes should appear coherently in operator-facing surfaces and docs.

### 3. Failure / Recovery Guidance

Tie degraded states to concrete next actions:

- what the operator should fix
- what Narada will still do safely
- what remains inspectable during degradation

## Non-Goals

- Do not make autonomous send the default.
- Do not add new executor families beyond what the chapter needs.

## Acceptance Criteria

- [ ] Real executor attachment is described and implemented as one coherent path.
- [ ] Degraded-state classes are explicit and user-visible.
- [ ] Recovery guidance is concrete, not just conceptual.
- [ ] Draft-first safety remains intact.
