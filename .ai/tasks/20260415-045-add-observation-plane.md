# Add Observation Plane

## Context

As Narada becomes a general kernel, inspection must not depend on terminal attachment or ad hoc debugging.

Operators need durable state views without making observability authoritative.

## Goal

Create an observation plane derived from durable state that exposes worker status, execution status, backlog, and results without UI/terminal coupling.

## Required Outcome

After this task:

- worker status is inspectable
- active execution is inspectable
- backlog and recent results are inspectable
- observations are derived from durable state
- no correctness path depends on terminal/UI/log attachment

## Required Work

### 1. Define observation surfaces

At minimum provide derived surfaces for:
- workers
- active executions
- pending work/backlog
- last results
- recent failures
- retry wait states

### 2. Ensure derivation from durable state

Observation must be reconstructible from durable state and approved derived views.

It must not depend on:
- transient logs
- terminal output
- in-memory only state

### 3. Separate observation from authority

Document and enforce:
- observation is read-only
- observation is not control truth
- deleting logs does not change correctness

### 4. Add tests

Add tests proving:
- observation views can be rebuilt
- rotating logs does not affect correctness
- worker/execution status surfaces match durable state accurately

## Invariants

1. Observation is derived, not authoritative.
2. Operator visibility must not require terminal attachment.
3. Observation views must be reconstructible from durable state.
4. No correctness path may depend on observation artifacts.

## Constraints

- do not build a full product UI
- do not introduce analytics pipelines
- do not make traces/logs mandatory
- do not redesign core durability just for dashboards

## Deliverables

- observation/read surfaces
- tests for reconstructibility
- small docs note on non-authoritative observation

## Acceptance Criteria

- operator inspection is possible without ambiguity
- observation does not become control truth
- tests pass

## Definition of Done

Narada has a real observation plane derived from durable kernel state.