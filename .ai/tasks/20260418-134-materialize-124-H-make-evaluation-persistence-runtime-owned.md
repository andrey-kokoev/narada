# Task 134: Materialize 124-H Make Evaluation Persistence Runtime-Owned

## Source

Derived from Task 124-H in `.ai/tasks/20260418-124-comprehensive-semantic-architecture-audit-report.md`.

## Why

Evaluation persistence is authoritative control-plane durability.

It should be explicit, singular, and owned by runtime integration before foreman resolution. If that boundary stays muddy, evaluations become partly conceptual and partly durable, which weakens auditability and control-plane clarity.

## Goal

Make evaluation persistence an explicit runtime responsibility that occurs before `resolveWorkItem()`, with foreman consuming persisted evaluations rather than ephemeral ones.

## Required Outcomes

### 1. Runtime persists before foreman resolution

The daemon/runtime path must persist evaluations durably before resolution.

### 2. Foreman resolves by durable identity

The preferred end state is:

- `ResolveWorkItemRequest` takes `evaluation_id`
- foreman loads the persisted evaluation by ID

instead of relying on a full in-memory evaluation payload.

### 3. Evaluation durability is no longer optional in the production path

There should not be a production path where evaluation rows are conceptually required but skipped.

### 4. Tests and docs reflect runtime ownership

The runtime/foreman split must be explicit in code, tests, and docs.

## Deliverables

- runtime-owned evaluation persistence before resolution
- foreman boundary aligned with durable evaluation identity
- updated tests/docs reflecting the corrected ownership

## Definition Of Done

- [ ] production runtime persists evaluations before calling `resolveWorkItem()`
- [ ] foreman no longer depends on ephemeral-only evaluation handoff as the canonical model
- [ ] tests/docs make the runtime-owned persistence model explicit

