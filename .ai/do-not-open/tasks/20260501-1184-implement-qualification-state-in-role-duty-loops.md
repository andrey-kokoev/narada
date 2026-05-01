---
status: claimed
depends_on: [1183]
---

# Implement qualification state in role duty loops

## Chapter

site-qualification-policy

## Goal

Make role duty loops and work-next enforce Site qualification requirements before governed work classes.

## Context

After SiteQualificationPolicy is defined, duty-loop surfaces should expose qualification current/required/expired/blocking states rather than relying on agents remembering refresh obligations.

## Required Work

Add qualification-state read model and work-next/role-loop integration; derive when an agent must requalify from Site policy, role, work class, completed-task count, law changes, inactivity, or capability class; return exact receipt/effectiveness-check commands; preserve role boundaries.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] work-next reports qualification_current, qualification_required, expired, blocked, and effectiveness_check_required states or documented equivalents.
- [ ] Qualification gates only affected work classes and allows non-governed inspection/reporting where safe.
- [ ] Completed-task-count trigger is supported as policy, not hardcoded reminder behavior.
- [ ] Output provides exact commands for receipt, absorption, or effectiveness check.
- [ ] Tests cover qualified agent, expired qualification, new law change, N completed tasks, and sensitive work gate.
