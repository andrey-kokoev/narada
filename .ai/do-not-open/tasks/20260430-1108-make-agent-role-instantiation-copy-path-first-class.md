---
status: opened
---
# Make agent role instantiation copy path first-class

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1105-1109-first-time-operator-ergonomics.md

## Goal

Let the Operator instantiate architect, builder, and observer role surfaces for a Site through one stable, copyable, authority-aware path.

## Context

Current role onboarding is improved but still fragmented: role bootstrap text, identity admission, focused window binding, and operator-surface labels can diverge. First-time Operators need a repeatable path that avoids accidental self-binding to the wrong role.

## Required Work

1. Audit operator-surface agent instantiate, identity, bind-focused, rebind, labels, and Site AGENTS generation.
2. Provide a canonical role-instantiation command or documented command sequence for architect, builder, and observer.
3. Include self-bind instructions and post-bind verification for each operator-surface based role.
4. Ensure observer language uses observer/coherence terminology and does not reintroduce dharma-specific naming.
5. Ensure the output is copyable into a fresh agent window and includes the normal-duty-loop meaning of `next`.

## Non-Goals

- Do not add new roles by speculation.
- Do not make observer a builder, reviewer, closer, or task mutator.
- Do not assume Windows-only transport if the Site is not Windows-locus.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] The role-instantiation path can produce copyable bootstrap text for architect, builder, and observer with role-specific duties and boundaries.
- [ ] The path includes self-bind or deferred-bind instructions appropriate to the current runtime locus.
- [ ] The path verifies the focused binding/label after binding and reports misbinding clearly.
- [ ] Generated or documented instructions state that `next` triggers the role's normal duty loop.
- [ ] Focused tests cover architect, builder, observer, and missing runtime-locus binding cases.
