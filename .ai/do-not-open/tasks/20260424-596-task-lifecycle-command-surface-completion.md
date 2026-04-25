---
status: closed
created: 2026-04-24
depends_on: [589]
closed_at: 2026-04-24T21:25:03.502Z
closed_by: a1
governed_by: task_close:a1
---

# Task 596 - Task Lifecycle Command Surface Completion

## Goal

Complete and normalize Narada's task lifecycle command family so normal task transitions are fully command-mediated and no longer rely on direct substrate habits or hidden operator choreography.

## Context

Narada already has many lifecycle operators:

- claim
- continue
- release
- report
- review
- finish
- close
- reopen
- roster transitions
- evidence inspection

But existence is not the same as completion.

The live ambiguity is:

- whether the lifecycle surface is actually complete enough for normal work,
- whether overlapping commands still hide arbitrary workflow choices,
- and whether any common lifecycle transition still depends on direct markdown or SQLite habits.

## Required Work

1. Audit the current lifecycle command family as one surface, not as isolated commands.
2. Define the canonical lifecycle map from:
   - opened
   - claimed
   - needs_continuation
   - in_review
   - closed
   - confirmed
   including which command owns each normal transition.
3. Identify redundant, overlapping, or under-specified lifecycle paths.
4. Make explicit which operator paths are normal and which are exceptional.
5. Implement the missing normalization needed so lifecycle work can be done command-only.
6. Add focused tests for any repaired lifecycle ambiguity or missing transition ownership.
7. Record verification or bounded blockers.

## Non-Goals

- Do not widen into task spec amendment here.
- Do not redesign assignment/dispatch here except where lifecycle boundaries depend on them.
- Do not preserve hidden “just edit the file” lifecycle fallbacks.

## Execution Notes

- Audited current lifecycle command family (`task-claim`, `task-release`, `task-continue`, `task-report`, `task-review`, `task-finish`, `task-close`, `task-reopen`, `task-dispatch`) against state machine in `task-governance.ts`.
- Implemented `packages/layers/cli/src/commands/task-confirm.ts` + wired in `main.ts` to close the `closed → confirmed` gap at individual task level.
- Documented canonical lifecycle transition map in `AGENTS.md` §Task Lifecycle Transition Map — explicit normal/exceptional classification for all 13 transitions.
- Key redundancy resolved: `task finish` is an orchestrator (calls report/review/roster-done), not a transition command. `task close` vs `task review accepted` both reach `closed` from `in_review` intentionally — operator closure vs peer review closure.
- Bounded exceptional paths: `needs_continuation → opened` (no direct command, path via continue→release), `draft → opened` (create produces opened directly), `confirmed → in_review` (reopen --force).
- Focused tests: `test/commands/task-confirm.test.ts` — 8/8 pass.
- `pnpm typecheck` clean across all 11 packages.

## Verification

```bash
cd packages/layers/cli
npx vitest run test/commands/task-confirm.test.ts --pool=forks
# Result: 8 passed (8)
```

End-to-end:
```bash
pnpm narada task confirm 595 --by a1 --format json
# Returns: status confirmed, confirmed_by a1
```

## Acceptance Criteria

- [x] Canonical lifecycle transition ownership is explicit
- [x] Redundant/overlapping lifecycle ambiguity is reduced or removed
- [x] Missing lifecycle command-surface pieces are implemented or bounded
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded



