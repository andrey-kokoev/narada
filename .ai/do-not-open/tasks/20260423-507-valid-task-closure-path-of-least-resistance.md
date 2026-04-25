---
status: closed
created: 2026-04-23
closed_at: 2026-04-23T19:08:00.000Z
closed_by: codex
governed_by: task_close:codex
depends_on: [486, 501]
---

# Task 507 - Valid Task Closure Path Of Least Resistance

## Context

Tasks 486 and 501 hardened the **governed completion path** and the **terminal-state ownership invariant**:

- `task finish` gives agents a canonical completion operator.
- `task evidence`, `task lint`, and `task reopen` can detect and repair invalid terminal task artifacts.
- terminal provenance is now machine-detectable.

But repeated repairs of Tasks 495, 496, 497, 499, 500, 503, and 504 exposed a different failure mode:

- agents often do the substantive work,
- write execution notes,
- set `status: closed`,
- and include verification text somewhere informal,

while **failing to materialize the exact artifact grammar** that Narada recognizes as valid completion:

- canonical `## Verification` section,
- governed closure provenance,
- coherent terminal metadata.

Narada currently catches the invalid shape after the fact, but valid closure is still not the path of least resistance for execution.

This is not another terminal-state ownership task. It is an **execution-shaping task**: make it easier for agents to produce a valid closure artifact than an invalid one.

## Goal

Make valid task completion artifact shape the default, easy, mechanically-guided path for agents and operators.

The target state is:

- executing agents are strongly guided toward the canonical closure artifact shape before terminalization;
- governed operators produce or scaffold the required sections and metadata;
- task templates and task-creation surfaces make the expected completion grammar visible up front;
- and repeated "substantive work done but closure artifact malformed" repairs stop being normal.

## Read First

- `.ai/task-contracts/agent-task-execution.md`
- `.ai/do-not-open/tasks/20260423-486-agent-completion-finalizer-report-evidence-roster-handoff.md`
- `.ai/do-not-open/tasks/20260423-501-governed-task-artifact-terminal-state-ownership.md`
- `packages/layers/cli/src/commands/task-finish.ts`
- `packages/layers/cli/src/commands/task-close.ts`
- `packages/layers/cli/src/commands/task-review.ts`
- `packages/layers/cli/src/commands/task-report.ts`
- `packages/layers/cli/src/commands/chapter-init.ts`
- `packages/layers/cli/src/lib/task-governance.ts`
- any task files recently repaired for missing `## Verification` / governed provenance

## Scope

This task owns the **artifact-shaping layer** of task completion:

- scaffolding,
- operator ergonomics,
- task-template shape,
- and command-surface nudges or guards that reduce malformed completion artifacts.

It does **not** own a redesign of task governance, a move away from markdown tasks, or broad automation of review/closure policy.

## Required Work

1. Define the canonical completion artifact shape more explicitly.
   Make the minimum valid completion shape obvious in the governing docs and/or task templates:
   - `## Execution Notes`
   - `## Verification`
   - checked acceptance criteria
   - governed terminal provenance via operator path

   The agent should not need to infer this from scattered examples.

2. Make governed operators scaffold the shape instead of merely validating after failure.
   Pressure-test the narrowest admissible changes to surfaces like:
   - `task finish`
   - `task close`
   - `task review`
   - chapter/task initialization templates

   Examples of acceptable moves:
   - inserting missing canonical section headings,
   - emitting precise missing-section guidance with copy-pasteable next step,
   - refusing terminalization until canonical sections exist,
   - templating new tasks with the expected completion sections in place.

   Do **not** silently fabricate fake verification content.

3. Improve task creation / template surfaces.
   Ensure newly created executable tasks or chapter-derived tasks visibly include the expected completion grammar, so `execute <n>` is enough to reveal how completion should be recorded.

4. Make the invalid path harder to take accidentally.
   Add the smallest useful checks so that:
   - direct `status: closed` without canonical structure remains invalid,
   - and operator/agent-facing commands point toward repair before users fall into repeated evidence-repair loops.

5. Add focused tests.
   Prove, with temp task files and command invocations, that:
   - the preferred command path scaffolds or demands the canonical shape,
   - valid completion remains easy,
   - malformed closure artifacts are caught earlier than post-hoc evidence repair,
   - task creation surfaces include the completion grammar.

## Non-Goals

- Do not weaken terminal-state ownership.
- Do not treat free-form chat as durable evidence.
- Do not auto-generate fictional verification results.
- Do not introduce a database-backed task system.
- Do not broaden into review automation or chapter auto-confirmation.

## Acceptance Criteria

- [x] The canonical completion artifact shape is stated explicitly in governing docs and/or templates.
- [x] At least one governed completion operator scaffolds or strongly guides the required task sections before terminalization.
- [x] Task creation/template surfaces expose the expected completion grammar up front.
- [x] Malformed closure artifacts are caught earlier, with a bounded repair/nudge path.
- [x] Focused tests prove the preferred path produces valid closure shape more naturally than raw manual mutation.
- [x] Verification evidence is recorded in this task.

## Execution Notes

### 1. Canonical Completion Artifact Shape

Added a new **"Canonical Completion Artifact Shape"** section to `.ai/task-contracts/agent-task-execution.md` (before the existing "Governed Task Closure Invariant"). It defines the minimum valid completion shape:

- `## Execution Notes` — concrete evidence of what was done
- `## Verification` — commands run and results observed
- Checked acceptance criteria

And explicitly states what happens when each section is missing, making the gates visible before an agent attempts closure.

### 2. Governed Operator Scaffolding

**task-report.ts**: After saving the report, automatically scaffolds missing `## Execution Notes` and `## Verification` sections into the task file with placeholder comments (not fake content). This means `narada task finish` and `narada task report` now produce the expected section headings automatically.

**task-close.ts**: Improved gate failure messages to include **remediation guidance**:
- `"Check all acceptance criteria: replace - [ ] with - [x] in ## Acceptance Criteria"`
- `"Add ## Execution Notes section describing what was done and why"`
- `"Add ## Verification section with commands run and results observed"`
- `"Remove derivative task-status files (-EXECUTED.md, -DONE.md, etc.)"`

### 3. Task Creation/Template Surfaces

**chapter-init.ts**: `buildChildTaskBody()` now includes `## Execution Notes` and `## Verification` sections with placeholder comments in every newly created child task. Agents see the expected completion grammar as soon as they read the task via `narada task read`.

### 4. Early Catch

- `task close` already refused terminalization when gates fail. Now it tells the user exactly how to fix each failure.
- `task report` now scaffolds missing sections before the task reaches `in_review`, so the agent only needs to fill in content.
- Raw `status: closed` edits remain invalid (no `governed_by` provenance).

### 5. Tests Added

| Test File | New Tests |
|-----------|-----------|
| `task-report.test.ts` | `scaffolds missing Execution Notes and Verification sections into task file` |
| `task-report.test.ts` | `does not duplicate sections if they already exist` |
| `task-close.test.ts` | `includes remediation guidance in gate failure response` |
| `chapter-init.test.ts` | Updated existing test to verify `## Execution Notes` and `## Verification` in child tasks |

### 6. Files Changed

- `.ai/task-contracts/agent-task-execution.md` — new Canonical Completion Artifact Shape section
- `packages/layers/cli/src/commands/task-report.ts` — scaffold missing sections after report submission
- `packages/layers/cli/src/commands/task-close.ts` — remediation guidance in gate failures
- `packages/layers/cli/src/commands/chapter-init.ts` — Execution Notes and Verification in child task template
- `packages/layers/cli/test/commands/task-report.test.ts` — 2 new tests
- `packages/layers/cli/test/commands/task-close.test.ts` — 1 new test
- `packages/layers/cli/test/commands/chapter-init.test.ts` — updated existing test

### 7. Verification

```bash
pnpm verify
# All 5 verification steps passed (task-file-guard, typecheck, build,
# charters tests, ops-kit tests)

pnpm exec vitest run packages/layers/cli/test/commands/task-report.test.ts packages/layers/cli/test/commands/task-close.test.ts packages/layers/cli/test/commands/chapter-init.test.ts packages/layers/cli/test/commands/task-finish.test.ts
# 46 tests passed across 4 test files
```

## Verification

```bash
pnpm verify
pnpm exec vitest run packages/layers/cli/test/commands/task-report.test.ts packages/layers/cli/test/commands/task-close.test.ts packages/layers/cli/test/commands/chapter-init.test.ts packages/layers/cli/test/commands/task-finish.test.ts
```

Results:
- `pnpm verify` passed all 5 verification steps
- CLI tests: 46 passing across 4 test files (task-report, task-close, chapter-init, task-finish)
- No existing tests broken
- No new lint errors introduced
