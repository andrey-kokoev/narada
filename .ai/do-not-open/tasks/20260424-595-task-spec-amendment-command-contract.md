---
status: confirmed
created: 2026-04-24
depends_on: [589, 593, 594]
amended_by: a2
amended_at: 2026-04-24T20:56:32.269Z
closed_at: 2026-04-24T20:57:14.863Z
closed_by: a2
governed_by: task_close:a2
confirmed_by: a1
confirmed_at: 2026-04-24T21:20:02.514Z
---

# Task 595 - Task Spec Amendment Command Contract

## Goal

Define and implement the sanctioned command path for amending task specification content.


## Context

Once `task create` and `task read` exist, the next unavoidable question is:

> How is task specification changed?

If this is left unresolved, Narada preserves the most important direct-edit escape hatch:

- operators and agents will still open task markdown and patch:
  - title
  - goal
  - context
  - required work
  - non-goals
  - acceptance criteria

That would leave command-mediated task authority incomplete.

## Required Work

1. Define the exact scope of **task specification** for amendment purposes.
   At minimum decide which fields/sections belong to spec amendment:
   - title
   - goal
   - context
   - required work
   - non-goals
   - acceptance criteria
   - required reading
2. Define the sanctioned amendment operator surface.
   Make explicit whether the normal path is:
   - field-based command flags
   - structured patch input
   - editor-launch behind the command
   - or another single-command-mediated posture
   Choose one canonical default.
3. Define amendment authority and standing:
   - who may amend task spec
   - whether assignee and operator differ
   - what must be audited
   - what counts as reopen-worthy vs ordinary amendment
4. Define how amendment interacts with existing task state:
   - opened
   - claimed
   - in_review
   - closed / confirmed
   Do not leave closed-task mutation policy implicit.
5. Implement the chosen amendment surface.
6. Add focused tests covering at minimum:
   - happy-path spec amendment
   - invalid section/field targeting
   - closed-task posture
   - audit/provenance behavior
   - no direct markdown authoring required on the normal path
7. Record verification or bounded blockers.

## Non-Goals

- Do not redesign lifecycle transitions here.
- Do not preserve free-form direct markdown editing as an equally-valid normal path.
- Do not leave the canonical amendment posture undecided.

## Execution Notes

- Implemented `packages/layers/cli/src/commands/task-amend.ts` with `taskAmendCommand()`.
- Wired into CLI program in `packages/layers/cli/src/main.ts` as `narada task amend <task-number>`.
- **Amendment surface**: field-based command flags (`--title`, `--goal`, `--context`, `--required-work`, `--non-goals`, `--criteria`, `--append-criteria`, `--from-file`). Single canonical default: field-based flags.
- **Authority/standing**: `--by <id>` required. Any operator or agent may amend. Amendments recorded in front matter (`amended_by`, `amended_at`) and in `## Execution Notes` body section.
- **State interaction**: `opened`, `claimed`, `needs_continuation`, `in_review` freely amendable. `closed` and `confirmed` tasks blocked — must reopen first. Policy explicit, not implicit.
- **Audit**: Every amendment writes `amended_by`/`amended_at` to front matter and appends a timestamped note to `## Execution Notes` listing what changed.
- Focused tests in `packages/layers/cli/test/commands/task-amend.test.ts` (17 cases) pass via `vitest run --pool=forks`.
- End-to-end verified: `pnpm narada task amend 595 --by a2 --goal "..." --format json` succeeded.
- `pnpm typecheck` clean across all 11 packages.

## Verification

```bash
cd packages/layers/cli
npx vitest run test/commands/task-amend.test.ts --pool=forks
# Result: 17 passed (17)
```

## Acceptance Criteria

- [x] Task spec amendment surface is explicit
- [x] Canonical amendment posture is explicit
- [x] Amendment authority/standing is explicit
- [x] Implementation exists
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded



