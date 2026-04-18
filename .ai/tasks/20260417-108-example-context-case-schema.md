# Example ContextCase Schema

## Mission
Define the canonical fixture schema for top-level examples so the examples catalog is executable and kernel-aligned.

## Why This Exists
The base example unit should match the kernel model rather than a mailbox-only mental model.

The canonical unit is a `ContextCase`, not a mailbox thread by default.

## Scope

- schema for `ContextCase`
- expected input surface
- expected decision surface
- expected output assertions
- draft versus executable fixture status

## Required Shape

A `ContextCase` should be able to express:

- source or vertical identity
- normalized context input
- foreman routing expectations
- charter invocation expectations
- expected classifications and facts
- expected intents or outbound proposals
- forbidden outcomes

## Deliverables

### 1. Canonical Schema

Define a schema or TypeScript interface for `ContextCase`.

It should support at least:

- `case_id`
- `title`
- `status`
- `vertical`
- `context_input`
- `thread_or_context_state`
- `knowledge_items`
- `expected_primary_charter`
- `expected_invocations`
- `expected_outputs`
- `forbidden_outputs`

### 2. Fixture Status Model

Define allowed statuses such as:

- `draft`
- `active`
- `deprecated`

### 3. Assertion Model

Define what counts as assertable output:

- expected charter set
- expected primary charter
- expected classifications
- expected facts
- expected proposed actions or intents
- expected forbidden actions

## Definition Of Done

- [ ] canonical `ContextCase` schema is defined
- [ ] fixture status model is defined
- [ ] assertable output model is defined
- [ ] schema is suitable for use in `examples/context-cases/`
