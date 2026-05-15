---
status: in_review
---

# Make role-targeted review obligations structurally non-duplicative

## Chapter

task-governance

## Goal

Make pure role-targeted directed obligations use target_role without duplicating the role in target_ref.

## Context

Operator noted that target_role=builder and target_ref=role:builder duplicate information. The routing shape should make that impossible in Narada proper.

## Required Work

Change the directed obligation store/schema so role-targeted obligations can have null target_ref; normalize legacy role:<role> refs to null; add a schema-level guard that rejects role:<target_role> duplication; repair current open role-targeted review obligations; add focused regression coverage.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] DirectedObligationRow target_ref is nullable.
- [ ] The directed_obligations SQLite schema permits null target_ref and rejects target_ref = role:<target_role>.
- [ ] Store upsert normalizes role-targeted target_ref=role:<role> to null.
- [ ] Current builder role-targeted review obligations have target_ref null.
- [ ] Focused tests and builds pass.
