.ai/tasks/20260415-028-mailbox-policy-routing-and-charter-binding.md

# Mailbox Policy Routing and Charter Binding

## Context

Tasks 024–027 close:

- crash/replay determinism
- runtime correctness
- identity unification
- trace re-anchoring

The next structural gap is that live execution is still too hardcoded around a default charter shape.

Narada now has a real control-plane path, but it still does not fully decide work according to mailbox-local policy and binding configuration.

This task replaces hardcoded charter selection with explicit mailbox policy routing.

## Goal

Define and implement the policy layer that determines:

> for a given mailbox and conversation, which charter(s), tool catalog, and runtime constraints apply.

This must become configuration- and policy-driven, not embedded in foreman or envelope defaults.

## Problem

Today, the system can still drift toward a hidden assumption like:

- every mailbox uses `support_steward`
- every conversation is treated the same
- tool availability is injected ad hoc
- runtime constraints are global rather than mailbox-scoped

That is acceptable for a first real loop, but not for the intended Narada substrate.

## Required Outcomes

The system must support explicit mailbox policy binding that determines:

- primary charter
- optional secondary charter(s)
- allowed actions
- available tools
- runtime constraints
- escalation policy
- approval requirements, if any

## Required Work

### 1. Define Mailbox Policy Object

Introduce a canonical mailbox policy/binding model.

It must answer, per mailbox:

- primary charter id
- secondary charter ids, if any
- allowed action classes
- allowed tool ids
- runtime mode / overrides, if mailbox-specific
- escalation defaults
- human-approval requirements, if supported

This may live in config, SQLite, or both — but the authority boundary must be explicit.

### 2. Remove Hardcoded Charter Defaults from Core Flow

Eliminate hardcoded charter assumptions from:

- foreman conversation record creation
- invocation envelope building
- daemon dispatch path

No core path should silently assume `support_steward` unless it is explicitly the configured fallback policy.

### 3. Bind Tool Catalog Through Policy

Tool exposure must flow from mailbox policy.

That means:

- invocation envelope receives tools based on mailbox binding
- daemon/runtime must not inject tools outside policy
- policy is the source of truth for allowed runtime capabilities

### 4. Bind Allowed Actions Through Policy

Allowed actions in invocation envelope must come from mailbox policy.

This must align with foreman validation and outbound handoff.

No divergence allowed between:
- what charter is told it may do
- what foreman will actually accept

### 5. Decide Scope of Policy Granularity

Explicitly decide whether policy is:

- mailbox-wide only
- mailbox + conversation-class
- mailbox + charter role

Pick the minimum sufficient granularity.

Do not over-generalize.

### 6. Add Tests

Add tests proving:

- different mailboxes can route to different primary charters
- tools differ by mailbox policy
- allowed actions differ by mailbox policy
- hardcoded fallback does not silently override configured binding
- invalid policy configuration fails deterministically

## Invariants

1. Mailbox policy is authoritative for charter routing.
2. Foreman and invocation envelope must agree on allowed actions.
3. Tool availability must be policy-derived, not runtime-discovered.
4. No mailbox may silently inherit unsafe defaults.
5. Policy binding must be inspectable and testable.

## Constraints

- do not redesign scheduler
- do not redesign identity model
- do not expand to multi-mailbox dispatch mechanics yet
- do not introduce speculative policy DSLs
- do not treat traces as policy input

## Deliverables

- mailbox policy model
- implementation of charter/tool/action routing from policy
- removal of hardcoded charter defaults in live execution path
- tests for policy-based routing and validation
- minimal documentation update describing policy authority

## Acceptance Criteria

- live execution no longer depends on hardcoded charter selection
- tool and action bindings are policy-driven
- policy mismatches fail explicitly
- two mailboxes can differ in behavior through config/policy alone
- tests pass

## Definition of Done

Narada chooses charter behavior from explicit mailbox policy rather than embedded defaults.