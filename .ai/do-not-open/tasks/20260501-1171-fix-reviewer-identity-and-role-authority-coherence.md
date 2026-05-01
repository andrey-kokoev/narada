---
status: opened
---

# Fix reviewer identity and role authority coherence

## Chapter

review-authority-capa

## Goal

Make governed review support declared reviewer identities without workaround principals or role collapse.

## Context

Inbox incident env_5c92d2fc-4b31-4aec-8abd-1d93fd4fdee3 reports that narada-andrey.Kevin found a blocking authority-boundary defect but task review refused the requested reviewer identity and then refused architect, forcing review to be recorded as operator.

## Required Work

Define review authority semantics for named architect/reviewer identities; add repair guidance when a requested reviewer is missing or lacks role authority; support explicit architect-as-reviewer authority where a Site declares it; add CAPA guidance for reviewer identity mismatch; add tests for refused reviewer, explicit repair path, and admitted reviewer.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] task review reports exact repair guidance when the requested reviewer identity is not admitted or lacks reviewer/admin authority.
- [ ] A Site can declare named reviewer or architect-as-reviewer authority without recording reviews as operator workarounds.
- [ ] Reviewer identity mismatch during governed review creates or recommends CAPA classification instead of silent principal substitution.
- [ ] Tests cover missing reviewer identity, unauthorized reviewer role, and admitted reviewer identity.
- [ ] Documentation distinguishes Operator, Architect, Reviewer, Builder, and Observer review authority boundaries.
