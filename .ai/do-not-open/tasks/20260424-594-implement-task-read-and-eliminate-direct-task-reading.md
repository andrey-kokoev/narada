---
status: closed
created: 2026-04-24
depends_on: [586, 589]
closed_at: 2026-04-24T20:43:28.239Z
closed_by: a2
governed_by: task_close:a2
---

# Task 594 - Implement `narada task read` And Eliminate Direct Task Reading

## Goal

Implement a canonical `narada task read` observation operator and complete the cutover so direct task reading is no longer the normal way operators or agents observe tasks.

## Context

The command-mediated task-authority chapter already made the target regime explicit:

- no direct task reading as normal task work,
- sanctioned observation operators instead,
- substrates remain behind commands.

But that regime is not real until there is one obvious, complete, operator-facing read surface that replaces:

- opening markdown files,
- grepping task bodies,
- reading SQLite tables directly,
- or using partial observation commands as ad hoc substitutes.

This task is the full cutover for task reading.

## Required Work

1. Implement a canonical `narada task read <task-number>` command.
2. Make its output sufficient for normal task observation, at minimum covering:
   - title
   - goal / context / required work
   - acceptance criteria
   - current lifecycle state
   - dependencies
   - assignment / continuation / review / closure state where relevant
   - evidence/completeness posture
   - artifact references
3. Define and implement projection posture:
   - human-readable default
   - machine-readable JSON
   - no raw substrate dump on the normal path
4. Ensure the read path is authoritative-over-substrate:
   - it may read markdown/SQLite internally,
   - but the caller must not need to know or care which substrate provided which field
5. Cut over existing normal task-reading guidance and flows to the sanctioned command.
   At minimum inspect and repair:
   - docs/help that imply “open the task file”
   - operator-facing instructions that rely on direct file reading
   - agent-facing guidance that treats markdown as the normal read surface
6. Define and implement direct-reading elimination posture.
   Make explicit what “eliminate” means in this task:
   - no normal operator/agent guidance to read task files directly
   - no normal workflow depending on direct markdown or SQLite reads
   - any residual low-level read access classified as debug/maintenance only
7. Add focused tests covering at least:
   - happy-path single-task read
   - JSON output shape
   - evidence/assignment/dependency visibility
   - non-existent task
   - no raw substrate leakage on default path
8. Record verification or bounded blockers.

## Non-Goals

- Do not implement all mutation operators here.
- Do not widen into chapter-reading redesign unless required to keep task read coherent.
- Do not preserve direct file reading as an equally-valid normal observation path.

## Execution Notes

- `packages/layers/cli/src/commands/task-read.ts` already existed with comprehensive implementation merging markdown spec with SQLite lifecycle state into a unified `TaskReadResult`.
- Wired command into CLI program in `packages/layers/cli/src/main.ts` as `taskCmd.command('read <task-number>')` with `--format` and `--verbose` options.
- Built and verified end-to-end: `pnpm narada task read 593 --format json` produces structured output with title, goal, context, required work, acceptance criteria, status, dependencies, assignment, reports, reviews, closure, evidence posture, and warnings.
- Updated `AGENTS.md` §Task Completion Semantics: replaced "Read the task file" with `narada task read <n>` for checking "Task artifact closed".
- Direct-reading elimination posture:
  - Normal observation: `narada task read <n>` (human or JSON)
  - List/scan: `narada task list`, `narada task graph`
  - Evidence audit: `narada task evidence <n>`, `narada task evidence list`
  - Residual direct file/SQLite access is classified as debug/maintenance only; no operator or agent guidance suggests it as normal workflow.
- Focused tests in `packages/layers/cli/test/commands/task-read.test.ts` (11 cases) pass via `vitest run --pool=forks`:
  - non-existent task, invalid task number, full JSON shape, execution notes/verification, filesystem assignment, SQLite lifecycle override, human-readable output, no substrate leakage, truncation, verbose full output, terminal-task warnings.

## Verification

```bash
cd packages/layers/cli
npx vitest run test/commands/task-read.test.ts --pool=forks
# Result: 11 passed (11)
```

End-to-end:
```bash
pnpm narada task read 593 --format json
# Returns structured task object with all required fields
```

## Acceptance Criteria

- [x] `narada task read <n>` exists and works
- [x] Its output is sufficient for normal task observation
- [x] Human and JSON projections are both coherent
- [x] Normal operator/agent guidance no longer depends on direct task-file reading
- [x] Residual low-level reading, if any, is explicitly classified as debug/maintenance only
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded


