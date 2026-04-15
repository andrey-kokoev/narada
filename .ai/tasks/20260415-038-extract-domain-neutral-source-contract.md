# Extract Domain-Neutral Source Contract

## Context

Narada must stop treating Exchange as the privileged ingress shape.

The first extraction step is a small kernel-level `Source` contract with explicit cursor/checkpoint semantics.

This task is preparatory. It does not yet create the kernel. It creates the minimal ingress discipline needed for the Fact boundary.

## Goal

Introduce a domain-neutral `Source` contract such that Exchange becomes one concrete source implementation and no kernel type leaks mailbox semantics.

## Required Outcome

After this task:

- Narada has a kernel-level `Source` abstraction
- Exchange ingress is wrapped as `ExchangeSource`
- source contracts carry explicit cursor/checkpoint semantics
- no kernel `Source` type contains mailbox-specific fields
- existing mailbox behavior is preserved

## Required Work

### 1. Define the minimal kernel Source contract

Define a small contract, no plugin theater.

It must express at least:

- source identity
- cursor / checkpoint input
- pull / read operation
- ordered record output
- next cursor / checkpoint output

The contract must be domain-neutral.

Forbidden in kernel `Source` types:
- conversation_id
- message_id
- mailbox_id
- folder names
- Exchange-specific event kinds

These belong in the Exchange vertical implementation payloads, not the kernel contract.

### 2. Define source record shape

Introduce a neutral source-record shape for raw source output before fact compilation.

It must include enough to support:
- provenance
- ordering
- checkpoint advancement
- replay safety

But it must not yet be the durable Fact envelope.

### 3. Wrap Exchange ingress behind Source

Refactor current Exchange sync ingress so it can be represented as an `ExchangeSource` implementing the kernel contract.

Preserve:
- current sync behavior
- current cursor/checkpoint semantics
- current replay expectations

Do not yet change downstream policy/foreman behavior.

### 4. Define cursor/checkpoint semantics explicitly

Document, in code and task notes:

- whether cursor is opaque or structured
- monotonicity requirements
- replay expectations
- duplicate-read tolerance
- when checkpoint advancement is legal

### 5. Add tests

Add tests proving:

- ExchangeSource emits records through the Source contract
- checkpoints advance deterministically
- repeated pull with same checkpoint is replay-safe
- kernel Source types do not require mailbox-specific fields

## Invariants

1. Source is ingress discipline, not business meaning.
2. Cursor/checkpoint semantics are explicit.
3. Source abstraction must remain mailbox-neutral.
4. This task must not introduce hidden source-specific behavior in the kernel.

## Constraints

- do not yet introduce Fact
- do not redesign foreman
- do not redesign outbound/intent
- do not create speculative registry/framework abstractions
- do not break current mailbox behavior

## Deliverables

- kernel-level Source contract
- ExchangeSource implementation or adapter
- tests for cursor/checkpoint behavior
- small code comments/doc note on source semantics

## Acceptance Criteria

- Exchange ingress can be described through the new Source contract
- Source types remain mailbox-neutral
- checkpoint behavior is explicit and tested
- existing mailbox sync behavior still works

## Definition of Done

Narada has a real domain-neutral ingress contract, but mailbox behavior is unchanged.