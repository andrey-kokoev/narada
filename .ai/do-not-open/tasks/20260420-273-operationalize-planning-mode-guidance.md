# Task 273: Operationalize Planning Mode Guidance

## Chapter

Multi-Agent Task Governance

## Context

Narada task execution now has enough agent parallelism that some tasks should start with a planning step before edits, while narrow corrective tasks should not pay that overhead.

The current task contract tells agents how to handle artifacts, authority, verification, and feedback, but it does not define when an agent should enter planning mode before editing.

Without explicit guidance, agents may:

- edit large semantic surfaces without naming their write set
- miss authority-boundary risks before implementation
- overuse planning mode for trivial corrections
- underuse planning mode for cross-package or lifecycle-changing work

## Goal

Make planning-mode usage operational and non-ritualized.

Agents should know when to plan first, what a sufficient plan contains, and when direct execution is preferred.

## Required Work

### 1. Update Agent Task Execution Contract

Update `.ai/task-contracts/agent-task-execution.md` with a `Planning Mode` section.

The section must define:

- when planning mode is required
- when planning mode is optional
- when planning mode should be skipped
- what minimum plan contents are required

Required planning triggers:

- task touches multiple packages
- task changes authority boundaries
- task changes lifecycle states or state machines
- task changes config schema, persistence schema, CLI public surface, or daemon behavior
- task depends on another in-flight task or may conflict with another agent
- task involves choosing between materially different designs

Direct execution should be preferred for:

- artifact-only cleanup
- focused review
- test-count or documentation drift
- small CLI wiring
- localized bug fix with obvious write set

### 2. Add Task Authoring Guidance

Update or create the appropriate task-authoring guidance so future task creators can mark execution mode explicitly.

Use two short snippets:

```md
## Execution Mode

Start in planning mode before editing. The plan must name:
- intended write set
- invariants at risk
- dependency assumptions
- focused verification scope
```

```md
## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.
```

Prefer an existing task contract or planning document over inventing a new location.

### 3. Avoid Ceremony

The guidance must explicitly state that planning mode is not a default ritual.

It is a risk-control mechanism for larger or semantically risky tasks.

### 4. Keep Existing Tasks Stable

Do not rewrite existing task files just to add `Execution Mode`.

Only update standing guidance and templates/contracts. Existing tasks may remain as-is unless they are already being edited for another reason.

## Non-Goals

- Do not implement CLI enforcement.
- Do not add schema validation for execution mode.
- Do not change task lifecycle states.
- Do not create derivative task-status files.
- Do not run broad test suites.

## Acceptance Criteria

- [x] `.ai/task-contracts/agent-task-execution.md` defines planning-mode escalation rules.
- [x] Task-authoring guidance includes explicit execution-mode snippets.
- [x] Guidance distinguishes required planning, optional planning, and direct execution.
- [x] Guidance says planning mode is not a ritual/default for narrow tasks.
- [x] Existing task files are not bulk-rewritten.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.

## Execution Notes

### Changes Made

**`.ai/task-contracts/agent-task-execution.md`** — Added two new sections:

1. **`## Planning Mode`** — Defines:
   - **Required triggers**: multi-package, authority boundaries, lifecycle changes, schema changes, in-flight conflicts, design choices
   - **Optional triggers**: public API changes, new observation/control surfaces, test strategy changes
   - **Skip conditions**: artifact cleanup, focused review, doc/test drift, small CLI wiring, localized bug fixes
   - **Minimum plan contents**: intended write set, invariants at risk, dependency assumptions, focused verification scope
   - Explicit statement that planning is a risk-control mechanism, not a default ritual
   - Guidance on when to use the agent environment's planning mode vs inline planning

2. **`## Execution Mode`** — Provides two copy-paste snippets for task creators:
   - Planning mode snippet (for large/semantic tasks)
   - Direct execution snippet (for narrow corrective tasks)

No existing task files were modified. Only the standing contract was updated.

### Review Polish

Architect review tightened two wording issues in the contract:

- Replaced tool-specific `EnterPlanMode` wording with "the agent environment's planning mode".
- Replaced "task front matter" with "task body" because the execution-mode snippets are Markdown sections, not front-matter fields.

### Verification

- No code changes were made; this is a contract-only task.
- `pnpm verify` reports pre-existing type errors in `packages/layers/cli/src/commands/config.ts` and `doctor.ts` (unrelated `"warn"` vs `"warning"` type mismatches) that existed before this task. These are not caused by this contract change.
