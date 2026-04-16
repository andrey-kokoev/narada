# Unify Executor Lifecycle and Confirmation Semantics

## Context

Tasks 040 and 042 introduce Intent and a process executor family.

The next remaining cavity is that execution lifecycle and completion/confirmation semantics are still likely uneven across mailbox and non-mailbox executors.

Narada needs one clean execution algebra.

## Goal

Unify Intent → execution → completion/confirmation semantics across executor families while preserving effect-of-once guarantees.

## Required Outcome

After this task:

- executor lifecycle semantics are explicit and uniform
- mailbox and process executors follow the same kernel rules
- completion and confirmation are first-class and durable
- recovery/replay behavior is consistent across executor families

## Required Work

### 1. Define generalized executor lifecycle

Make explicit the lifecycle states and transitions for all executor families.

At minimum clarify:
- intent admitted
- execution started
- execution completed or failed
- effect confirmed or terminally unresolved

### 2. Separate execution from confirmation

Do not let mailbox remain special here.

If an executor can start/complete locally but requires later confirmation, that model must be explicit and general.

### 3. Align mailbox and process families

Mailbox and process may have different confirmation mechanics, but both must fit the same kernel lifecycle model.

### 4. Preserve idempotency and recovery

Any lifecycle unification must preserve:
- effect-of-once boundary
- crash recovery
- duplicate suppression
- deterministic replay

### 5. Add tests

Add tests proving:
- mailbox and process intents move through the unified lifecycle coherently
- confirmation semantics are durable and reconstructible
- replay/retry does not duplicate effects
- failure paths remain deterministic

## Invariants

1. Intent remains the universal durable effect boundary.
2. Executor lifecycle semantics must be explicit and uniform.
3. Confirmation is durable and not mailbox-special by accident.
4. Recovery and effect-of-once guarantees must survive.

## Constraints

- do not redesign Source/Fact/context/work layers here
- do not weaken existing mailbox correctness
- do not create a distributed workflow engine
- do not rely on traces for lifecycle truth

## Deliverables

- unified executor lifecycle model
- mailbox/process alignment
- durable confirmation semantics
- tests
- docs update

## Acceptance Criteria

- mailbox and process fit one executor lifecycle model
- confirmation is explicit and durable
- recovery/idempotency remain correct
- tests pass

## Definition of Done

Narada has one coherent execution algebra across executor families.