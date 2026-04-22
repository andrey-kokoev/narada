---
status: confirmed
depends_on: [410, 406]
---

## Chapter

Construction Operation

# Task 412 — PrincipalRuntime Integration Contract

## Assignment

Define how PrincipalRuntime state (Task 406) integrates with task governance and assignment recommendation without collapsing the ephemeral/durable boundary.

## Required Reading

- `.ai/decisions/20260422-406-principal-runtime-state-machine.md`
- `.ai/decisions/20260422-411-assignment-planner-design.md`
- `packages/layers/cli/src/lib/task-governance.ts`
- `packages/layers/cli/src/commands/task-roster.ts`
- `packages/layers/control-plane/src/principal-runtime/types.ts`

## Context

PrincipalRuntime is ephemeral by design — if deleted, Sites continue running. Task governance is file-based and durable. The roster is advisory tracking. These three layers must remain distinct while the assignment planner consumes data from all three.

The integration contract must answer:
- How does the planner read PrincipalRuntime state?
- How does the planner read roster state?
- What happens when they disagree?
- How does a principal's `unavailable` state affect recommendations?
- How does a principal's `budget_exhausted` state create continuation/handoff?

## Concrete Deliverables

1. Decision artifact at `.ai/decisions/20260422-412-principal-runtime-integration-contract.md` containing:
   - Data flow diagram (planner → PrincipalRuntime registry, roster, task graph)
   - Conflict resolution rules (roster says working, PrincipalRuntime says detached)
   - Availability model (which principal states permit recommendation)
   - Budget/handoff model (how budget exhaustion surfaces in recommendations)
   - Observation surface design (how operator sees integrated state)
   - Update to `AGENTS.md` if package boundaries change

## Explicit Non-Goals

- Do not implement the integration code.
- Do not make PrincipalRuntime state authoritative over task lifecycle.
- Do not auto-transition principals based on task state.
- Do not merge roster and PrincipalRuntime into one object.

## Acceptance Criteria

- [x] Decision artifact exists.
- [x] Data flow diagram shows read-only consumption from PrincipalRuntime.
- [x] Conflict resolution rules are explicit and conservative (favor operator knowledge).
- [x] Availability model respects the six PrincipalRuntime invariants from Decision 406.
- [x] No implementation code is added.

## Verification Scope

Review by operator or architect. No automated tests required.

## Execution Notes

Task completed prior to Task 474 closure invariant. Decision artifact `.ai/decisions/20260422-412-principal-runtime-integration-contract.md` created containing data flow diagram, conflict resolution rules (conservative, favor operator knowledge), availability model respecting PrincipalRuntime invariants, and budget/handoff model. No implementation code added. PrincipalRuntime remains read-only to the planner.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
