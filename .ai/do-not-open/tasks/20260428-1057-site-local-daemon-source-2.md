---
status: opened
depends_on: [1056]
---

# Task 1057 — Fix timer source projection outside mailbox assumptions

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- packages/layers/control-plane/src/sources
- packages/layers/control-plane/src/runner
- packages/layers/daemon/src
- packages/layers/control-plane/docs/00-kernel.md

## Context

The thoughts Site daemon accepted timer source configuration but failed at runtime because lower projection expected mailbox-shaped event kind data. TimerSource must either produce a valid vertical-agnostic fact shape or be rejected clearly before runtime.

## Goal

Make configured timer sources admissible in the daemon/control-plane path without passing through mailbox-only event projection.

## Required Work

1. Find the timer source path and the projector that emitted Unknown event kind: undefined.
2. Add a vertical-agnostic timer fact/admission path or a clear preflight rejection if timer daemon support is not ready.
3. Ensure any fix preserves mailbox vertical behavior and does not invent mailbox fields for timer facts.
4. Add focused tests for timer source config/runtime behavior.
5. Document any residual deferred behavior.

## Non-Goals

- Do not build a scheduler loop beyond the bounded source fix
- Do not add mailbox-specific fields to timer events

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Timer source no longer reaches mailbox-only projection and fails with Unknown event kind: undefined
- [ ] Timer source either produces a valid vertical-agnostic fact/admission result or is rejected at preflight with a clear message
- [ ] Focused tests cover the chosen behavior
- [ ] pnpm verify passes
