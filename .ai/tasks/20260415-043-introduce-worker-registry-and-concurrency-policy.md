# Introduce Worker Registry and Concurrency Policy

## Context

Once non-mailbox sources and executors exist, Narada needs explicit named workers and concurrency rules.

This must not become ad hoc per vertical.

## Goal

Add first-class worker identities and dispatch policy so multiple workers can run under one runtime with explicit concurrency semantics.

## Required Outcome

After this task:

- workers have explicit identities
- worker-to-policy/executor relationships are explicit
- concurrency behavior is chosen intentionally, not incidentally
- singleton/drop/latest or equivalent policies are available where justified

## Required Work

### 1. Define Worker identity

Introduce a first-class worker concept.

It must allow the system to answer:
- what worker is responsible for this execution
- what policy/executor family it belongs to
- what concurrency rules apply

### 2. Define minimal concurrency policy model

Support a small explicit set, such as:
- singleton
- parallel
- drop_if_running
- latest_wins

Choose only what is needed.
Avoid speculative scheduler theater.

### 3. Bind workers to execution flow

Ensure work/execution records can be associated with explicit worker identity.

### 4. Preserve existing lease/recovery behavior

Worker identity and concurrency policy must not bypass or undermine:
- leasing
- idempotency
- recovery
- supersession semantics

### 5. Add tests

Add tests proving:
- explicit worker identities exist
- concurrency behavior matches declared policy
- duplicate/overlapping work is handled deterministically
- multiple workers can coexist without hidden coupling

## Invariants

1. Worker identity must be explicit.
2. Concurrency behavior must be policy, not accident.
3. Worker registry must remain small and non-speculative.
4. Existing durability/recovery boundaries must remain intact.

## Constraints

- do not build a broad plugin platform
- do not redesign the entire scheduler
- do not introduce distributed orchestration
- do not couple worker identity to terminal/UI concepts

## Deliverables

- worker identity model
- concurrency policy model
- wiring into execution flow
- tests for concurrency semantics

## Acceptance Criteria

- workers are first-class and inspectable
- concurrency behavior is explicit and deterministic
- tests pass
- no hidden worker semantics remain

## Definition of Done

Narada has explicit worker identities and concurrency rules instead of incidental runtime behavior.