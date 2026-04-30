---
status: opened
---

# Make Operator Surface self-bind emit executable runtime-locus handoff

## Chapter

Operator Surface Addressability Ergonomics

## Goal

Make `operator-surface bind-focused --as self` either bind through the owning runtime locus or emit an exact executable handoff command instead of a placeholder runtime-locus token.

## Context

Builder ran `narada operator-surface bind-focused --as self --format json`. Narada correctly resolved self to builder and deferred because volatile handle authority belongs to a User/PC runtime locus, but the output only gave `--runtime-locus <pc-or-user-site>`. This is technically authority-preserving but operationally incoherent: the command intended to bind the current focused session should not require the agent/operator to already know an opaque runtime locus, and the deferred command should be directly executable or explicitly explain what discovery command must be run next.

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] `narada operator-surface bind-focused --as self --format json` no longer returns only `--runtime-locus <pc-or-user-site>` when it defers.
- [ ] Deferred output includes either an exact executable command with resolved runtime locus or a bounded exact discovery command sequence.
- [ ] Output names resolved identity, durable identity authority, volatile handle authority, and mutation posture.
- [ ] Human output is actionable without hidden prior knowledge of runtime-locus ids.
- [ ] Tests cover builder self-bind deferral, executable handoff, unknown runtime-locus guidance, and refusal to mutate foreign volatile authority.
- [ ] Operator Surface status/send repair guidance reuses the improved executable handoff where applicable.
