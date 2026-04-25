---
status: closed
depends_on: [397, 406]
---

# Task 408 — Construction Operation Chapter Shaping

## Execution Mode

Planning mode is required before edits.

The agent must first list:
- Intended write set
- Invariants at risk
- Dependency assumptions
- Focused verification scope

This is a chapter-planning task. It must create a minimal follow-up task graph. It must not implement the Construction Operation itself.

## Chapter Name

**Construction Operation**

This is the Narada Operation whose Aim is to advance a system by governed task-graph execution while preserving long-horizon coherence.

Do not call it "meta operation", "Narada recursion", or "AI project manager". Those names smear the object boundary.

## Assignment

Create the chapter plan for extracting the current human-architect-agent development loop into a first-class Narada Operation.

The chapter must drive Narada from:

> user manually assigning agents through chat, with architect guidance and task files

to:

> Narada can recommend bounded task assignments from a task graph, roster/principal state, dependencies, capabilities, affinity, review separation, and write-set risk, while the human operator retains intent, priority, veto, and acceptance authority.

## Required Reading

- `.ai/task-contracts/chapter-planning.md`
- `.ai/task-contracts/agent-task-execution.md`
- `SEMANTICS.md`
- `.ai/decisions/20260422-397-session-attachment-semantics.md`
- `.ai/do-not-open/tasks/20260422-406-principal-runtime-state-machine-design.md`
- `.ai/do-not-open/tasks/20260421-385-mechanical-agent-roster-tracking.md`
- `.ai/do-not-open/tasks/20260420-260-agent-roster-and-assignment-state.md` if present
- `.ai/do-not-open/tasks/20260420-261-task-lifecycle-automation.md` if present
- `.ai/do-not-open/tasks/20260420-262-review-loop-and-task-number-allocation.md` if present
- `.ai/do-not-open/tasks/20260420-263-chapter-closure-and-warm-agent-routing.md` if present
- `packages/layers/cli/src/commands/task-list.ts`
- `packages/layers/cli/src/commands/task-claim.ts`
- `packages/layers/cli/src/commands/task-release.ts`
- `packages/layers/cli/src/commands/task-review.ts`
- `packages/layers/cli/src/commands/task-roster.ts`
- `packages/layers/cli/src/lib/task-governance.ts`

## Context

The current Narada build process already has a Narada-like shape:

- source facts: user messages, agent reports, git/task state, test results;
- work items: task files and corrective tasks;
- evaluation: architect coherence assessment;
- decision: operator priority, veto, assignment, acceptance;
- execution: worker/reviewer agents;
- observation: reviews, verification, commits, roster state;
- re-derivation: new tasks from findings;
- closure: chapter closure, changelog, commit.

The missing system capability is assignment governance. The human operator currently dispatches agents manually because Narada does not yet have a planner/dispatcher that can recommend safe assignments.

This chapter should not implement full autonomous assignment. It should first prove recommendation-quality assignment under operator authority.

## Chapter Boundary

The chapter should include only the work required to make Narada recommend assignments for construction tasks.

In scope:
- Construction Operation boundary and roles;
- task graph input model;
- principal/roster capability input model;
- assignment recommendation algorithm;
- review separation and write-set conflict checks;
- review-to-corrective-task loop boundary;
- fixture proving assignment recommendation and corrective loop;
- operator retains final approval.

Out of scope:
- autonomous task dispatch;
- autonomous commits;
- direct agent spawning;
- replacing the human operator;
- treating architect evaluation as authority;
- generic project-management product surfaces.

## Required Work

1. Produce a readiness/gap decision artifact.

   Create:
   - `.ai/decisions/20260422-408-construction-operation-readiness.md`

   It must answer:
   - What parts of the Construction Operation already exist?
   - What manual human work is currently compensating for missing machinery?
   - What should remain human/operator authority?
   - What can be safely recommended by Narada?
   - What must not be automated yet?
   - What existing task/roster/review surfaces are reused?
   - What new surfaces are required?

2. Create a chapter DAG file.

   Use the next monotonically available task range after this task.

   Expected shape, if still correct after analysis:
   - Construction Operation boundary contract
   - Assignment planner / dispatcher design
   - PrincipalRuntime integration contract
   - Review-to-corrective-task loop
   - Construction Operation fixture
   - Chapter closure

   Put the reduced DAG in `.ai/do-not-open/tasks/YYYYMMDD-NNN-MMM.md`.
   Mermaid must be plain. Do not add classes or styling.

3. Create self-standing follow-up tasks.

   Each task must be executable by number alone and include:
   - required reading
   - concrete deliverables
   - explicit non-goals
   - acceptance criteria
   - verification scope

4. Include a CCC posture table.

   Use the shape from `.ai/task-contracts/chapter-planning.md`.

   The table must distinguish:
   - evidenced state now;
   - projected state if the chapter verifies;
   - pressure path;
   - evidence required.

5. Preserve authority boundaries.

   The chapter must explicitly preserve:
   - Assignment recommendation is not assignment authority.
   - Human operator retains final assignment/priority/veto authority in this chapter.
   - Architect assessment is evaluation, not command.
   - Principal availability does not grant authority.
   - Roster state is not durable runtime truth.
   - Review findings do not mutate tasks without explicit operator or governed command.

6. Decide the chapter name.

   Default name is **Construction Operation**.

   If changed, justify why the new name is semantically better and does not overload `operation`, `Site`, `Cycle`, `Act`, `Trace`, `agent`, or `principal`.

## Non-Goals

- Do not implement assignment planner code in this task.
- Do not create autonomous dispatch.
- Do not mutate roster except if using the roster CLI to record this task assignment externally.
- Do not create private operational data.
- Do not change existing task lifecycle semantics.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Readiness/gap decision artifact exists.
- [x] Chapter name is selected and justified.
- [x] Chapter DAG file exists with monotonically increasing task numbers.
- [x] Follow-up tasks are self-standing and executable by number alone.
- [x] CCC posture table includes evidenced state and projected state.
- [x] Assignment recommendation is explicitly separated from assignment authority.
- [x] Human operator authority is preserved.
- [x] No implementation code is added.
- [x] No derivative task-status files are created.

## Execution Notes

Task completed prior to Task 474 closure invariant. Decision artifact `.ai/decisions/20260422-408-construction-operation-readiness.md` created. Chapter DAG `.ai/do-not-open/tasks/20260422-410-415-construction-operation.md` created with monotonically increasing task numbers 410–415. Follow-up tasks (410–415) are self-standing. CCC posture table includes evidenced and projected states. Assignment recommendation is explicitly separated from assignment authority. Human operator authority preserved. No implementation code added.

## Verification

Verified by inspecting `.ai/decisions/20260422-408-construction-operation-readiness.md` and `.ai/do-not-open/tasks/20260422-410-415-construction-operation.md`.
