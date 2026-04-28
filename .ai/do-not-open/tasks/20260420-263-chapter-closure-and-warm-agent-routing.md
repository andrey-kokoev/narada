---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T17:25:33.971Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777397036450_nclc7p
amended_by: architect
amended_at: 2026-04-28T17:25:27.206Z
closed_at: 2026-04-28T17:26:01.317Z
closed_by: architect
governed_by: task_close:architect
closure_mode: peer_reviewed
---

# Task 263: Chapter Closure and Warm-Agent Routing

## Chapter

Multi-Agent Task Governance

## Goal

Implement the chapter closure operator and add continuation-affinity support to task work.

## Context

Two advanced governance capabilities are missing:

1. **Chapter closure operator**: Currently, closing a chapter is a manual checklist. There is no explicit operator that verifies all chapter tasks are complete, generates a summary, and transitions the chapter to `closed`.

2. **Warm-agent / continuation-affinity for task work**: The control plane has advisory `continuation_affinity` on `work_items` (Task 212) — a preference for which session or agent should continue the work. Task work has no equivalent. An agent who completed Task 260 and has full context should be able to express a preference for Task 261.

## Required Work

### 1. Chapter Closure Operator (mutation)

Create an explicit chapter closure operator:
```bash
narada chapter close <chapter-name> --dry-run
```

This should:
1. Enumerate all tasks tagged with the chapter.
2. Verify each task is `closed` or `confirmed`.
3. List any tasks that are not terminal.
4. Generate a summary artifact:
   - Tasks completed
   - Tasks deferred
   - Review findings and their resolutions
   - Residuals (gaps not closed)
5. In non-dry-run mode, write the closure artifact and transition all tasks to `confirmed`.

The closure artifact should live at `.ai/decisions/YYYY-MM-DD-<chapter>-closure.md`. Writing this artifact is an operator action.

### 2. Warm-Agent Affinity Schema (static/advisory)

Add optional continuation-affinity fields to task files:

```yaml
---
task_id: 263
status: opened
continuation_affinity:
  preferred_agent_id: "kimicli"
  affinity_strength: 1
  affinity_reason: "Agent completed prerequisite Task 260"
---
```

Rules (mirroring work-item affinity from Task 212):
- `affinity_strength` is an integer (higher = stronger preference).
- The claim **operator** may sort `opened` tasks by affinity strength when presenting runnable work.
- Affinity is advisory: it must not block a task from being claimed by another agent.
- If `preferred_agent_id` is specified but the agent is inactive, the task remains runnable.

Affinity fields are static schema. The operator consumes them as advisory signals.

### 3. Assignment History as Affinity Source (operator behavior)

The claim operator may automatically compute affinity from assignment history:
- If an agent completed Task N and Task N+1 depends on Task N, the operator may suggest `preferred_agent_id: <agent>` with `affinity_strength: 1`.
- Manual affinity in the task file overrides computed affinity.

This is an operator convenience, not a schema requirement.

## Non-Goals

- Do not enforce affinity as a hard constraint.
- Do not implement agent presence detection or heartbeat.
- Do not auto-close chapters without explicit operator trigger.

## Execution Notes

### Chapter Closure Operator

Created `packages/layers/cli/src/commands/chapter-close.ts`:
- `narada chapter close <chapter-name> [--dry-run]`
- Enumerates tasks by chapter via `scanTasksByChapter()` (looks for `## Chapter\n<name>` in task body)
- Categorizes tasks: confirmed, closed, in_review, claimed, opened/needs_continuation, draft
- Gathers review findings from `.ai/reviews/` for completed tasks
- Identifies residuals: unresolved findings marked defer/wontfix
- **Dry-run**: previews summary without mutations; lists non-terminal tasks as warnings
- **Non-dry-run**: writes closure artifact to `.ai/decisions/YYYY-MM-DD-<chapter>-closure.md` and transitions `closed` tasks to `confirmed`
- **Precondition enforcement** (Task 280 corrective): non-dry-run fails if any task is non-terminal (`in_review`, `claimed`, `opened`, `needs_continuation`, `draft`). No artifact is written and no transitions are performed.

Created `packages/layers/cli/test/commands/chapter-close.test.ts` with 5 tests covering:
- empty chapter error
- dry-run preview without mutation
- successful closure with artifact write and status transition
- **blocked closure when non-terminal tasks exist** (Task 280)
- review findings and residuals inclusion

### Warm-Agent Affinity

Added `continuation_affinity` fields to `TaskFrontMatter` in `task-governance.ts`:
- `preferred_agent_id`, `affinity_strength`, `affinity_reason`
- Affinity is advisory: `task list` sorts runnable tasks by affinity strength, but affinity cannot block a claim
- `computeTaskAffinity()` derives affinity from assignment history when no manual affinity is set
- Manual affinity overrides computed affinity
- `listRunnableTasks()` (lines 699–750) computes and sorts by affinity strength, surfacing the hint in the list view

### Verification

- `pnpm --filter @narada2/cli typecheck` — passes
- `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/chapter-close.test.ts"` — 5/5 pass
- `pnpm verify` — passes (5/5 steps)
- Amended by architect at 2026-04-28T17:25:27.206Z: acceptance criteria

## Verification

- `pnpm --filter @narada2/cli typecheck` — passes
- `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/chapter-close.test.ts"` — 5/5 pass
- `pnpm verify` — passes (5/5 steps)
- Amended by architect at 2026-04-28T17:25:27.206Z: acceptance criteria

## Acceptance Criteria

- [x] Chapter closure operator enumerates verifies and summarizes chapter tasks
- [x] Dry-run mode previews closure without mutating state
- [x] Closure artifact is generated with tasks deferrals findings and residuals
- [x] Non-dry-run closure fails when any chapter task is non-terminal
- [x] Task files support continuation_affinity fields
- [x] task list sorts runnable tasks by affinity strength
- [x] task claim surfaces continuation affinity when claiming without enforcing it
- [x] Computed affinity from assignment history is stable and deterministic
