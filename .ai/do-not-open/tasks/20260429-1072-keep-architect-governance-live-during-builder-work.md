---
status: opened
amended_by: architect
amended_at: 2026-04-29T15:58:12.896Z
---

# Keep Architect governance live during Builder work

## Chapter

Architect Builder Handoff Ergonomics

## Goal

Remove the operational friction where Architect task creation routing and inbox governance are treated as blocked by concurrent Builder implementation dirtiness or stale CLI source state.

## Context

This task captures the repeated ergonomics failure from the 2026-04-29 Architect/Builder split: Architect treated Builder dirty implementation files and stale CLI dist as a stop condition for creating and routing governance work. That is incoherent. Architect governance actions should remain live while Builder executes implementation, provided Architect commits only its own governance artifacts and does not touch Builder-owned files. The current workaround uses the shim's stale-governance allowance, but the workflow still requires manual selective staging and lifecycle snapshot care.

## Required Work

1. Reproduce or document the concurrent-role scenario: Builder has dirty implementation files and possibly stale CLI source; Architect must create/specify/route a task. 2. Define the intended invariant: Builder implementation dirtiness is not a blocker for Architect governance mutations unless the same authority substrate files conflict. 3. Improve command/workflow support so Architect can create, amend, route inbox envelopes, and commit governance artifacts without accidental inclusion of Builder source/lifecycle changes. 4. Address direct inbox task targets or explicitly defer to the task-target routing task with bounded rationale. 5. Define how lifecycle snapshot and mutation evidence should behave under concurrent role work: partition, narrow export, role-scoped evidence, or safe selective-commit guidance. 6. Document the Architect handoff posture and expected verification path. 7. Add focused tests or scripted verification for stale-dist governance and concurrent dirty-work scenario. 8. Run pnpm verify if feasible; otherwise record why Builder dirty work prevents full-suite verification and run focused guards.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T15:58:12.896Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Architect can create specify and route inbox derived tasks while Builder has dirty implementation files
- [ ] Governance artifacts can be committed without accidentally including Builder lifecycle source or implementation changes
- [ ] Inbox routing supports task-number targets directly or records a bounded explicit deferral if direct task targets are not implemented yet
- [ ] Snapshot and mutation evidence behavior for concurrent Architect and Builder roles is defined narrowed or partitioned to avoid mixed-role commits
- [ ] Workflow is documented as Architect handoff posture and verification covers stale-dist governance plus concurrent dirty-work scenario
