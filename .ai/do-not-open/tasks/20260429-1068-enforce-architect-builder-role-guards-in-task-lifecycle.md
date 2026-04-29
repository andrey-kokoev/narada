---
status: opened
depends_on: [1065]
amended_by: architect
amended_at: 2026-04-29T15:06:45.274Z
---

# Enforce Architect Builder role guards in task lifecycle

## Chapter

Architect Builder Handoff Ergonomics

## Goal

Add lifecycle guardrails that prevent Architect from accidentally executing or closing Builder-owned implementation work while preserving Architect specification assignment and review authority.

## Context

This task addresses the role-collapse failure where Architect executed and closed CAPA doctrine work instead of assigning Builder. The role split is documented, but lifecycle commands do not enforce it.

## Required Work

1. Identify lifecycle commands that represent Builder implementation or closure of Builder-owned work. 2. Add role guard logic based on roster or assignment state, not chat labels. 3. Permit Architect to specify, assign, route, review, and admit where appropriate. 4. Block or strongly require explicit durable override when Architect attempts Builder-owned report, close, execution, or implementation lifecycle actions. 5. Record override rationale as evidence when allowed. 6. Add tests covering allowed Architect handoff, allowed Builder execution, blocked Architect execution, and explicit override. 7. Run pnpm verify.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T15:06:45.274Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Architect role may create specify assign route review and admit tasks but is warned or blocked from Builder-owned execution closure by default
- [ ] Builder-owned task report close or implementation commands require Builder or explicit override with rationale
- [ ] Override is durable evidence and visible in task evidence inspection
- [ ] Role guard uses configured roster or task assignment state rather than chat inference
- [ ] Tests cover allowed Architect handoff allowed Builder execution blocked Architect execution and explicit override and pnpm verify passes
