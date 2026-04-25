# Task 281: Complete Task 264 Runtime/USC Boundary and Chapter Closure

## Chapter

Multi-Agent Task Governance

## Context

Task `264` is not complete. Review found that its required deliverables are still missing:

- `docs/runtime-usc-boundary.md` does not exist
- `.ai/decisions/20260420-264-multi-agent-task-governance-closure.md` does not exist
- `CHANGELOG.md` does not contain a Multi-Agent Task Governance chapter entry
- `AGENTS.md` does not reference a runtime/USC boundary document

Task `264` currently remains a plan artifact, not an executed closure task.

## Goal

Complete the actual runtime/static/operator boundary documentation and close the Multi-Agent Task Governance chapter honestly.

## Required Work

### 1. Write the Boundary Document

Create `docs/runtime-usc-boundary.md` and make it explicit, concise, and normative.

It must distinguish exactly four ownership classes:

1. **Static schema / grammar**
   - task files
   - review record shapes
   - chapter metadata
   - charter/domain-pack/policy artifacts

2. **Pure tools / compilers**
   - validators
   - planners
   - schema readers
   - static transforms that do not mutate runtime state

3. **Operators**
   - claim
   - release
   - review
   - allocate
   - derive-from-finding
   - chapter close
   - confirm

4. **Runtime**
   - daemon
   - scheduler
   - foreman
   - workers
   - durable state and effect execution

The document must state clearly:

- static grammar defines shapes, not transitions
- operators perform task/chapter mutations
- runtime owns leases, work-item lifecycle, executions, and side effects
- USC/static packages may be read by runtime/tooling, but must not assume runtime state

### 2. Reference the Boundary Document

Update `AGENTS.md` so the boundary document is discoverable from the documentation index or another obvious section.

### 3. Close the Chapter Properly

Create `.ai/decisions/20260420-264-multi-agent-task-governance-closure.md` containing:

- capabilities delivered across Tasks `260-263`
- deferred gaps
- residual risks
- explicit closure statement

Do not claim commit hashes or ranges unless they are actually known and checked.
If commit-boundary information is not being established in this task, say so explicitly as a bounded deferral.

### 4. Update the Changelog

Add a `## Multi-Agent Task Governance` chapter entry to `CHANGELOG.md` summarizing:

- roster + assignment operators
- lifecycle/review operators
- chapter close operator
- continuation affinity on task work
- remaining deferrals

### 5. Review Artifact Honesty

Update `.ai/do-not-open/tasks/20260420-264-runtime-usc-boundary-and-chapter-closure.md` with:

- execution notes
- verification evidence
- bounded deferrals

Do not leave it as a plan-only task if this corrective work completes it.

## Execution Mode

Start in planning mode before editing. This touches docs, semantics, and chapter closure.

The plan must name:

- intended write set
- invariants at risk
- dependency assumptions
- focused verification scope

## Non-Goals

- Do not redesign the kernel spec.
- Do not introduce new runtime behavior unless a true boundary violation is discovered.
- Do not create derivative task-status files.

## Acceptance Criteria

- [ ] `docs/runtime-usc-boundary.md` exists and is coherent.
- [ ] `AGENTS.md` references the boundary document.
- [ ] `.ai/decisions/20260420-264-multi-agent-task-governance-closure.md` exists and is honest.
- [ ] `CHANGELOG.md` has a Multi-Agent Task Governance section.
- [ ] Task `264` includes execution notes, verification evidence, and bounded deferrals.
- [ ] No derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
