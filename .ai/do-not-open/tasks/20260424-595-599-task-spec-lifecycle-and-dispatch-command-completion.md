---
status: opened
created: 2026-04-24
reservation: 595-599
depends_on: [589]
---

# Task Spec, Lifecycle, And Dispatch Command Completion

## Goal

Complete the command-mediated task regime for the remaining core surfaces after `task create` and `task read`:

- task specification amendment
- lifecycle completion/normalization
- assignment and dispatch inspection/control

## Context

The command-mediated task-authority chapter made the target regime explicit, but the normal task surface is still incomplete.

The remaining high-value ambiguity is not "should commands exist?" It is:

- which missing task interactions are still forcing direct substrate habits,
- which existing operators are already sufficient,
- and which surfaces must be completed before task markdown and direct SQLite interaction can truly disappear from normal work.

At minimum, the remaining command-mediated gaps are:

1. **Spec amendment**
   - operators still need a sanctioned way to update title, goal, context, required work, and acceptance criteria without direct markdown editing

2. **Lifecycle**
   - many lifecycle operators exist, but the full surface still needs to be audited and completed as one coherent command family

3. **Assignment / dispatch**
   - assignment and dispatch exist in pieces, but the normal operator-facing surface is still fragmented

This chapter exists to remove the remaining arbitrariness across those three areas.

## Chapter DAG

```text
595 Task Spec Amendment Command Contract
596 Task Lifecycle Command Surface Completion
597 Task Assignment And Dispatch Command Surface Completion
598 Direct-Surface Elimination Readiness Review
595, 596, 597, 598 ─→ 599 Task Surface Completion Closure
```

## Tasks

| Task | Title | Purpose |
|------|-------|---------|
| 595 | Task Spec Amendment Command Contract | Define and implement how task spec content is amended without direct markdown editing |
| 596 | Task Lifecycle Command Surface Completion | Complete and normalize the lifecycle command family as the canonical transition surface |
| 597 | Task Assignment And Dispatch Command Surface Completion | Complete and unify assignment/dispatch observation and control surfaces |
| 598 | Direct-Surface Elimination Readiness Review | Review whether the task surface is now complete enough to actually remove direct substrate use from normal work |
| 599 | Task Surface Completion Closure | Close the chapter honestly and name the next implementation line |

## Closure Criteria

- [x] Task spec amendment no longer requires direct markdown editing
- [x] Lifecycle command family is explicit and complete enough for normal task work
- [x] Assignment/dispatch surface is explicit and complete enough for normal task work
- [x] Remaining direct-surface dependencies are explicitly identified or eliminated
- [x] First next implementation line is named
- [x] Verification or bounded blockers are recorded
