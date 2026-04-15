# Add Execution Lease and Recovery Generalization

## Context

Narada already has mailbox/control-plane lease and recovery machinery.

As the kernel generalizes, active execution must be made explicit and restart-safe across executor families, not only mailbox-shaped flows.

## Goal

Generalize active execution records, leases, and recovery rules so all executor families can recover deterministically.

## Required Outcome

After this task:

- active execution is explicit
- leases apply at generalized execution boundary
- stale execution recovery is deterministic
- restart/replay semantics remain correct for mailbox and process paths

## Required Work

### 1. Define generalized execution lease model

Extend or refactor current lease semantics so they apply to generalized execution, not only current mailbox-shaped work assumptions.

### 2. Define in-flight execution record

Persist enough information to answer:
- what is executing
- under which worker
- under which lease
- with which executor family
- whether recovery may resume/retry/supersede

### 3. Define stale execution recovery rules

For each execution family, clarify:
- when a lease is stale
- how recovery claims it
- whether retry resumes or restarts
- how duplicate effects are prevented

### 4. Preserve idempotency and intent boundaries

Execution recovery must remain subordinate to Intent and effect-of-once rules.

### 5. Add tests

Add tests proving:
- stale process execution is recoverable deterministically
- stale mailbox execution remains correct
- restart/replay converges without duplicate effects
- generalized lease semantics do not regress existing behavior

## Invariants

1. Active execution must be explicit and durable.
2. Recovery behavior must be deterministic.
3. Generalized execution lease semantics must preserve effect-of-once.
4. No executor family may invent its own hidden recovery model.

## Constraints

- do not redesign the whole scheduler
- do not build distributed locks
- do not depend on traces/logs for correctness
- do not weaken existing mailbox recovery behavior

## Deliverables

- generalized execution lease model
- durable in-flight execution records if needed
- recovery rules
- regression and new tests

## Acceptance Criteria

- generalized executor families recover deterministically
- no duplicate effects occur under restart/replay
- tests pass across mailbox and process flows

## Definition of Done

Execution lease and recovery semantics are explicit, generalized, and restart-safe.