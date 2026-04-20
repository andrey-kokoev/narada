# Task 213: Add Soft Routing Signals Layer

## Why

Task 212 introduces **continuation affinity**:

- related follow-on work is often better handled by the same recent lane/session/agent

That is one important routing optimization, but it is only one member of a broader family.

Narada is already strong on:

- durable truth
- authority boundaries
- lifecycle/state transitions
- replay/recovery/governance

Narada is weaker on **soft routing reality**:

- some lanes are better at specific classes of work
- some lanes already have relevant tool/process state warm
- some work should prefer cheaper acceptable execution lanes
- some work should be acted on near the triggering event while context is still fresh
- some lanes should be softly de-preferred after weak recent performance

These are not correctness invariants, but they are operationally real.

## Goal

Define and introduce a first-class layer of **soft routing signals** that can influence assignment/routing without becoming authority or correctness dependencies.

Task 212 remains the continuity-specific member. This task is the broader routing-signals layer.

## Core Principle

Soft routing signals are:

- advisory
- bounded
- observable
- overrideable
- non-authoritative

They may influence who should do work next.
They must not determine what is true or what is allowed.

## Required Scope

At minimum, Narada should model the following routing-signal families:

### 1. Continuation Affinity

Already covered by Task 212. This task must position it as one member of the broader layer, not re-specify its detailed implementation.

### 2. Capability Affinity

Some lanes are better suited to certain work classes.

Examples:

- mailbox triage
- SQL/debugging
- documentation/editorial work
- code review
- operational shell/tooling work

This is about demonstrated or configured fit, not hard permission.

### 3. Tool-State Affinity

A lane may already have useful short-lived state:

- checked-out repo context
- terminal/process state
- database connection/session familiarity
- mailbox/thread familiarity
- tool authentication already warm

Nearby work should be able to prefer that lane softly.

### 4. Cost Preference

Some work should prefer the cheapest acceptable lane/provider/model.

This is not simply “always use the cheapest”. It is a soft optimization subject to posture, quality, and authority constraints.

### 5. Freshness Preference

Some work is more valuable when handled close to its triggering event.

This is not a hard deadline. It is a soft routing/timing preference.

### 6. Trust / De-Preference Signal

Recent observed performance should be able to softly influence routing:

- prefer lanes with strong recent results on similar work
- de-prefer lanes with weak/noisy recent results

This is not authority revocation. It is adaptive routing.

## Required Outcome

Narada should gain a canonical notion of a routing signal and how signals are combined.

## Required Behavior

### 1. Canonical Routing Signal Model

Define a first-class concept such as:

- `routing_signal`
- `routing_preference`
- or equivalent

At minimum it should support:

- signal type
- target work / work class
- preferred lane/session/agent/provider
- strength / weight
- origin / reason
- freshness / expiry

### 2. Combination Rules

Narada must define how multiple signals interact.

At minimum:

- continuation may coexist with capability
- cost preference must not override hard posture constraints
- de-preference must not silently starve work forever
- stale signals expire

### 3. Distinction From Hard Mechanics

Explicitly distinguish routing signals from:

- dependency
- authority
- policy
- scheduler lease ownership
- correctness invariants

### 4. Observability

Narada should expose:

- which routing signals were considered
- which signal won
- when fallback occurred
- whether a signal was stale, unavailable, or overridden

### 5. Incremental Introduction

This task does not need to implement all families fully.

A coherent result is:

- canonical docs
- shared type(s)
- combination rules
- at least one additional signal family beyond continuation affinity wired into routing or selection logic

## Relationship To Task 212

Task 212:

- implements the continuity-specific mechanic

Task 213:

- defines the broader routing-signals layer
- positions continuation affinity inside it
- adds at least one more sibling signal family or the shared infrastructure needed for them

The two tasks must not fight over ownership.

## Non-Goals

- Do not turn routing signals into a new authority system
- Do not block runnable work waiting for an ideal lane
- Do not create opaque “AI intuition” routing without observability
- Do not re-implement all scheduler logic from scratch

## Suggested Landing Areas

Potentially:

- `SEMANTICS.md`
- `packages/layers/control-plane/docs/00-kernel.md`
- `packages/layers/control-plane/src/coordinator/types.ts`
- `packages/layers/control-plane/src/scheduler/`
- `packages/layers/control-plane/src/foreman/`

## Verification

Minimum:

```bash
pnpm verify
pnpm --filter @narada2/control-plane test
pnpm --filter @narada2/daemon test
```

Focused proof:

- multiple routing signals can coexist for a work item
- routing prefers a stronger/valid signal when available
- stale or unavailable signals fall back safely
- observability shows the signal reasoning path

## Definition Of Done

- [ ] Narada defines a soft routing signals layer distinct from authority and dependency.
- [ ] Continuation affinity is positioned as one member of that layer.
- [ ] At least one additional routing-signal family is documented and wired or concretely prepared for wiring.
- [ ] Signal combination and expiry rules are documented.
- [ ] Observability exists for signal consideration / honoring / fallback.
- [ ] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.
