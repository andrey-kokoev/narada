---
status: opened
depends_on: [411, 412, 413, 425]
---

# Task 426 — Assignment Recommendation Implementation

## Context

Narada's own build-out now depends on multiple agents working in parallel. The operator is still manually tracking:

- which tasks are unblocked;
- which agents are idle;
- which agents have warm context;
- which tasks conflict by write set;
- which work is ready for review;
- which reviewer should inspect what;
- which assignments would preserve review separation.

This operator load is now a bottleneck. Self-governance is no longer decorative; it is required for Narada's own build-out to remain constructively executable.

Existing groundwork:

- Task 411 designed the assignment planner.
- Task 412 defined how PrincipalRuntime can be consumed as advisory input.
- Task 413 defined review separation and write-set conflict rules.
- Task 425 introduces WorkResultReport as the durable "agent says done" boundary.

This task implements the first bounded self-governance operator: **assignment recommendation**.

## Goal

Implement an advisory `narada task recommend` command that ranks next task/agent assignments from the task graph, roster, assignment state, PrincipalRuntime snapshots if available, WorkResultReports, and review/write-set signals.

The command must not assign work automatically.

It produces evidence-backed recommendations that the operator may accept manually with existing assignment commands.

## Required Work

### 1. Define recommendation record types

Add types in `packages/layers/cli/src/lib/task-governance.ts` or a focused sibling module:

- `TaskRecommendation`
- `AgentCandidateScore`
- `RecommendationReason`
- `RecommendationRisk`
- `RecommendationInputSnapshot`

Each recommendation must include:

| Field | Meaning |
|-------|---------|
| `task_number` | Recommended task |
| `agent_id` | Recommended agent |
| `score` | Numeric ranking score |
| `status` | `recommended`, `possible`, `blocked`, or `not_recommended` |
| `reasons` | Positive evidence |
| `risks` | Conflict/dependency/review/runtime risks |
| `depends_on_satisfied` | Boolean |
| `capability_match` | Boolean or score |
| `warm_context_score` | Numeric advisory score |
| `workload_score` | Numeric advisory score |
| `review_separation_score` | Numeric advisory score |
| `write_set_risk` | `none`, `low`, `medium`, `high`, or `unknown` |

Recommendations are advisory signals. They must not mutate task, roster, report, review, or assignment files.

### 2. Implement planner input loading

Build a planner loader that reads:

- `.ai/tasks/*.md` task front matter and dependencies;
- `.ai/agents/roster.json`;
- `.ai/tasks/assignments/*.json`;
- `.ai/tasks/reports/*.json` if created by Task 425;
- `.ai/reviews/*.json`;
- PrincipalRuntime registry snapshots if available, but degrade gracefully if missing;
- optional changed-file/write-set hints from task bodies, WorkResultReports, and reviews.

Rules:

- Task files are authoritative for task status and dependency graph.
- Roster is authoritative for agent identity and coarse current assignment tracking.
- PrincipalRuntime is advisory only.
- WorkResultReports are evidence that work is ready for review, not assignment authority.
- Missing optional inputs must produce warnings, not hard failure.

### 3. Implement scoring

Implement deterministic scoring with documented weights.

Minimum scoring dimensions:

- **Dependency readiness**: tasks with unmet dependencies are blocked.
- **Task status**: only `opened` and `needs_continuation` tasks are assignable; `in_review` tasks should be routed to review, not implementation.
- **Agent availability**: idle/done agents preferred; working/reviewing agents penalized or excluded.
- **Capability match**: match task labels/body hints against roster capabilities.
- **Warm context**: prefer agents who recently completed predecessor tasks or related files, but keep it advisory.
- **Workload balance**: prefer less-loaded agents.
- **Review separation**: do not recommend an agent to review its own work; for implementation recommendations, flag if it will create review bottleneck.
- **Write-set risk**: penalize tasks likely to overlap with active assignments.

Scores must be explainable. Every positive or negative score component should produce a reason/risk entry.

### 4. Add CLI command

Add:

```bash
narada task recommend [--limit <n>] [--agent <id>] [--task <number>] [--format json|text] [--cwd <path>]
```

Behavior:

- default: show top recommendations across all assignable tasks and available agents;
- `--agent`: recommendations only for that agent;
- `--task`: candidate agents for one task;
- `--format json`: machine-readable output;
- text format: concise table with reasons and risks.

The command must be read-only.

### 5. Add focused tests

Add tests covering:

- unblocked opened task recommends idle capable agent;
- blocked task is not recommended;
- working agent is not recommended over idle agent;
- warm context increases score but does not override blocked dependencies;
- missing PrincipalRuntime registry degrades gracefully;
- high write-set risk is surfaced;
- `in_review` task is not implementation-recommended;
- JSON output is stable and parseable;
- command does not mutate task, roster, assignment, report, or review files.

### 6. Update docs/contracts

Update:

- `.ai/task-contracts/agent-task-execution.md`
- `.ai/decisions/20260422-411-assignment-planner-design.md` if implementation differs from the design
- `.ai/decisions/20260422-412-principal-runtime-integration-contract.md` if PrincipalRuntime consumption differs

Clarify:

- recommendations are advisory;
- assignment remains operator-owned via `narada task claim` / roster assignment;
- no recommendation may bypass dependencies or review separation;
- WorkResultReports feed review/routing evidence but do not prove correctness.

## Non-Goals

- Do not auto-assign agents.
- Do not auto-claim tasks.
- Do not auto-review WorkResultReports.
- Do not implement review routing in this task.
- Do not mutate task files from the recommend command.
- Do not make PrincipalRuntime authoritative.
- Do not add a daemon or background scheduler.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [ ] `narada task recommend` exists and is read-only.
- [ ] Recommendations include scores, reasons, and risks.
- [ ] Blocked tasks are not recommended as assignable.
- [ ] Idle/done capable agents are preferred over busy agents.
- [ ] Warm context is advisory and cannot override dependency blockers.
- [ ] PrincipalRuntime input is optional and advisory.
- [ ] WorkResultReport input is consumed only as evidence, not authority.
- [ ] Focused tests prove scoring, filtering, JSON output, and read-only behavior.
- [ ] Docs/contracts reflect implementation boundaries.
- [ ] No derivative task-status files are created.

## Suggested Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/task-recommend.test.ts test/lib/task-governance.test.ts
node packages/layers/cli/dist/main.js task recommend --format json --cwd .
```

Do not run broad suites unless focused verification exposes a cross-package failure that requires escalation.
