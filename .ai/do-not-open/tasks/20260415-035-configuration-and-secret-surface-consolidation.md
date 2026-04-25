.ai/do-not-open/tasks/20260415-035-configuration-and-secret-surface-consolidation.md

# Configuration and Secret Surface Consolidation

## Context

The system now spans:

- mailbox sync config
- runtime selection
- model/API credentials
- mailbox policy routing
- tool catalogs
- multi-mailbox configuration

These surfaces are growing and can easily become inconsistent or unsafe if not consolidated.

## Goal

Make configuration and secret handling coherent such that:

> every runtime-critical behavior is explicitly configured, validated, and non-ambiguous across single- and multi-mailbox operation.

## Required Work

### 1. Inventory Config Surface

Enumerate and rationalize config for:

- mailbox sync
- charter runtime
- runtime credentials
- mailbox policy routing
- tool binding
- multi-mailbox behavior
- retry/timeouts
- approval requirements

### 2. Normalize Secret Sources

Define supported secret sources and precedence:

- config file
- environment
- secure storage if present

No hidden secret resolution paths allowed.

### 3. Validate Configuration Early

Ensure startup validation catches:

- unsupported runtime values
- missing required credentials
- invalid mailbox policy
- invalid tool references
- cross-field incompatibilities

### 4. Define Single vs Multi-Mailbox Config Shape

Clarify what can be:
- global
- mailbox-specific
- inherited with override

### 5. Tests

Add config validation tests covering:
- valid single-mailbox config
- valid multi-mailbox config
- missing required secrets
- invalid tool/policy/runtime combinations
- override precedence behavior

## Invariants

1. Runtime-critical behavior must be explicitly configurable.
2. Invalid config must fail before side effects.
3. Secret resolution precedence must be deterministic.
4. Multi-mailbox config must not inherit unsafe defaults silently.

## Constraints

- do not redesign runtime behavior itself
- do not introduce remote config services
- do not create a policy DSL
- do not make tests depend on real secrets

## Deliverables

- consolidated config model
- validation logic updates
- secret precedence documentation
- tests

## Acceptance Criteria

- config surface is coherent
- invalid setups fail fast
- secret resolution is deterministic
- tests pass

## Definition of Done

Configuration ceases to be an implicit source of semantic drift.