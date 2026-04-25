# Task 123: Correct Task 017 Runtime Envelope Authority And Persistence

## Why

Task 017 was materially implemented, but review found architectural drift in the exact boundary it was supposed to stabilize.

Two concrete issues remain:

1. **Envelope authority is duplicated** between kernel and charters
2. **Evaluation persistence semantics drifted** away from the task's stated runtime-hook design

The result is a runtime envelope surface that works, but does not have one clean source of truth.

## Goal

Make the charter runtime envelope boundary structurally coherent by:

- choosing a single authority for the invocation/output contract
- making persistence responsibilities explicit and non-ambiguous

## Scope

This task must cover:

- charter invocation/output envelope authority
- runner-hook persistence semantics
- package boundary cleanup between kernel and charters
- tests/docs touched by that boundary

## Non-Goals

- Do not redesign the broader control plane
- Do not rewrite the whole charter runtime stack
- Do not change runtime behavior gratuitously if only authority cleanup is needed

## Findings To Correct

### 1. Duplicate Envelope Authority

Current state:

- `@narada2/charters` defines invocation/output schemas and validation
- `@narada2/kernel` also defines `CharterInvocationEnvelope`-shaped types and builds envelopes

This creates two authorities for the same runtime contract.

For a critical boundary like charter invocation/output, that is too much drift risk.

### 2. Evaluation Persistence Hook Drift

Task 017 explicitly called for evaluation persistence as part of the runtime adapter hook path.

Current state appears to be:

- trace persistence is hooked at runner integration time
- evaluation persistence happens later in foreman resolution

That may be the right architecture, but it must be made explicit and consistent with the task/docs/code boundary.

## Required Corrections

### 1. Choose One Envelope Authority

Pick one coherent model and implement it fully.

Likely good options:

- **Kernel owns the canonical invocation/output contract**, while `@narada2/charters` imports/re-exports and validates against it, or
- **Charters owns the canonical runtime contract**, while kernel imports the types from charters and stops defining parallel authority

Disallowed outcome:

- two separate packages each acting as first-class schema/type authorities for the same envelope contract

### 2. Make Persistence Responsibility Explicit

Choose one coherent responsibility split:

- if evaluation persistence belongs in foreman resolution, document and encode that clearly; the runner hook should not pretend otherwise
- if evaluation persistence belongs in the runtime adapter hook, wire it there explicitly and keep foreman logic aligned

The important requirement is not which choice wins; it is that the responsibility is singular and obvious.

### 3. Reduce Boundary Leakage

After choosing authority, reduce duplication by:

- re-exporting instead of redefining, or
- deleting parallel schema/type definitions, or
- introducing one thin adapter layer only if truly needed

### 4. Update Tests And Docs

Tests and docs must reflect the chosen authority/persistence model so the boundary is no longer ambiguous.

## Deliverables

- one clear package owns the runtime envelope contract
- evaluation persistence responsibility is explicit and singular
- duplicate contract definitions are removed or reduced to pure re-exports/adapters
- tests/docs align with the chosen model

## Definition Of Done

- [ ] there is one clear authority for charter invocation/output envelope types and validation
- [ ] evaluation persistence responsibility is explicit and not split ambiguously between runtime and foreman layers
- [ ] duplicate contract ownership is removed or reduced to re-exports only
- [ ] tests pass after the cleanup

## Notes

This is a corrective task for architectural drift discovered during review of Task 017 execution. The current implementation works materially; this task is about making the boundary structurally correct and easier to evolve safely.
