# Observability Without Authority

## Context

By this point Narada has:

- real daemon dispatch
- runtime execution
- tool calls
- outbound effects
- crash/replay semantics
- traces demoted from correctness state

### 1. Define Observability Surfaces

At minimum:
- daemon cycle summary
- mailbox dispatch summary
- work-item lifecycle summary
- execution attempt summary
- tool call summary
- outbound handoff summary

### 2. Define Canonical Status Views

Produce read-only derived views or commands that answer:
- what work is active
- what failed recently
- what is waiting on retry
- what outbound commands were created
- what sessions/executions are most recent

### 3. Define Error Classes for Operators

Standardize operator-visible categories such as:
- runtime_misconfig
- tool_policy_rejection
- tool_timeout
- charter_validation_failure
- outbound_idempotency_conflict
- replay_recovery_action

### 4. Ensure Non-Authority

Every observability artifact must be either:
- derived from durable truth
- or clearly marked commentary

No operator dashboard/view/log may be required for system correctness.

### 5. Tests

Add tests proving:
- views can be rebuilt from durable state
- deleting/rotating logs does not affect correctness
- metrics/status summaries reflect current durable state accurately

## Invariants

1. Observability is derived, not authoritative.
2. Logs may be useful, but not required.
3. Status summaries must be reconstructible.
4. Operator-facing error surfaces must map to real durable states.
