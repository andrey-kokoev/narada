# Introduce Unified Fact Envelope

## Context

Task 038 creates the ingress contract.

This task is the real kernel birth moment.

Narada needs a source-neutral durable Fact boundary so mailbox ingress is no longer privileged and future sources like timer/file/webhook can enter through the same replay-stable shape.

## Goal

Introduce the canonical durable and replay-stable Fact envelope and map Exchange source output into it.

## Required Outcome

After this task:

- Narada has a durable Fact envelope
- facts are source-neutral
- fact IDs are deterministic
- Exchange source output materializes as facts
- the same envelope can later represent timer ticks and filesystem changes

## Required Work

### 1. Define the canonical Fact envelope

Introduce a durable Fact type and persistence model.

Minimum fields must cover:

- fact_id
- fact_type
- source_id
- source_cursor or source_offset equivalent
- observed_at
- payload_json
- provenance / metadata needed for replay and debugging

The exact names may vary, but the semantics must not.

### 2. Define deterministic fact identity

Define how `fact_id` is computed.

It must be:
- deterministic
- replay-stable
- duplicate-tolerant
- source-neutral at the kernel level

The rules for canonicalization must be explicit.

### 3. Persist facts durably

Add the durable store for facts.

Requirements:
- append-safe
- replay-safe
- duplicate-resistant
- queryable by source and/or identity

Do not make facts transient.

### 4. Map Exchange source output into facts

Materialize current Exchange ingress as facts such as:

- `mail.message.discovered`
- or similarly precise mailbox-specific fact kinds

Mailbox-specific fact kinds are allowed.
Mailbox-specific kernel types are not.

### 5. Define provenance rules

Every fact must preserve:
- origin source
- origin ordering/cursor context
- enough provenance to reconstruct why it exists

### 6. Add tests

Add tests proving:

- identical source input yields identical fact identity
- repeated ingestion does not create duplicate facts
- Exchange source records compile into mailbox facts
- fact persistence survives replay/restart
- facts are source-neutral at the envelope level

## Invariants

1. Fact is the first canonical durable and replay-stable boundary.
2. Facts must not depend on mailbox-privileged kernel semantics.
3. Duplicate source reads must converge to the same fact identity.
4. Fact storage must be reconstructible and durable.

## Constraints

- do not yet generalize outbound into intent
- do not yet add TimerSource
- do not redesign execution adapters
- do not make facts depend on traces/logs

## Deliverables

- Fact envelope type
- durable fact store/schema
- deterministic fact identity rules
- Exchange-to-Fact mapping
- tests for replay/idempotency

## Acceptance Criteria

- facts are durable, deterministic, and replay-safe
- Exchange ingress becomes facts through the same envelope
- fact identity is tested
- existing mailbox behavior remains preserved

## Definition of Done

Narada has a real kernel Fact boundary rather than mailbox-shaped privileged ingress.