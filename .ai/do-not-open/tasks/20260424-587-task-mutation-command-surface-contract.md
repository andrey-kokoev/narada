---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T16:15:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [585]
artifact: .ai/decisions/20260424-587-task-mutation-command-surface-contract.md
---

# Task 587 - Task Mutation Command Surface Contract

## Goal

Define the sanctioned one-command task mutation surface so task creation, amendment, transition, and closure no longer rely on direct file editing or direct database mutation.

## Context

If direct editing and direct creation are prohibited, Narada must make all necessary mutations available through explicit operators.

The main hidden ambiguity is:

- which mutations are allowed,
- which command families own them,
- and whether the operator/agent still needs multi-step file choreography to complete common task work.

The target phrase "single-command driven" must become explicit, not rhetorical.

## Required Work

1. Enumerate the mutation families that must exist in the command-mediated regime, at minimum:
   - create a task
   - create a chapter
   - amend task specification
   - assign / continue / release
   - report / review / close / confirm / reopen
   - derive follow-up task(s)
   - attach findings / closures / reviews / reports
2. Define the boundary between:
   - specification mutation
   - lifecycle mutation
   - governance mutation
   - derived artifact creation
3. Define what "single-command driven" means for task work:
   - one sanctioned command should complete one governed operator action
   - normal task work must not require opening/editing files or databases directly
   - if a workflow still requires file choreography, it is not yet migrated
4. Define which currently common direct-edit patterns are prohibited in the target regime:
   - editing front matter directly
   - hand-writing new task files
   - manual chapter DAG edits outside sanctioned operators
   - raw SQLite writes for task operations
5. Define whether there is any sanctioned text-authoring surface for task spec content, and if so:
   - whether it is command arguments
   - editor-launch via command
   - patch/apply workflow behind a command
   - or structured prompt-driven generation
   Choose a canonical default rather than leaving all forms equally valid.
   If secondary forms remain, classify them as bounded alternatives with explicit standing.
6. Define mutation preconditions and authority separation where needed:
   - who may create
   - who may amend spec
   - who may transition lifecycle
   - who may close/reopen
   - who may derive or split follow-up work
7. Record verification or bounded blockers.

## Non-Goals

- Do not leave "for now people can still just edit the file" as implicit policy.
- Do not collapse all mutation kinds into one vague `task edit`.
- Do not assume lifecycle migration alone solves creation/amendment authority.
- Do not leave sanctioned authoring posture undecided.

## Execution Notes

### Artifact

Written `.ai/decisions/20260424-587-task-mutation-command-surface-contract.md` (~16 KB) covering:
- Five mutation command families (creation, assignment/continuation, lifecycle transition, composite/convenience, dispatch/execution)
- "Single-command driven" definition with examples of compliant and non-compliant workflows
- Spec-vs-lifecycle-vs-derived-artifact mutation boundary with detailed tables
- Eight explicit direct-edit prohibitions with sanctioned replacements
- Authority separation table (who may create, amend, transition, close, derive, promote)
- Sanctioned text-authoring posture: command arguments as canonical default, with bounded alternatives
- Verification evidence and bounded blockers (6 residual gaps honestly recorded)

### Verification

- `pnpm typecheck` — all 11 packages clean ✅
- Decision artifact exists and defines complete mutation surface ✅
- All five families documented with preconditions and authority classes ✅
- "Single-command driven" meaning explicit with concrete examples ✅
- Direct-edit prohibitions and authority separation both explicit ✅

## Acceptance Criteria

- [x] Mutation command families are explicit
- [x] "Single-command driven" meaning is explicit
- [x] Direct-edit prohibitions are explicit
- [x] Spec-vs-lifecycle-vs-derived-artifact mutation boundary is explicit
- [x] Sanctioned text-authoring posture is explicit
- [x] Verification or bounded blocker evidence is recorded
