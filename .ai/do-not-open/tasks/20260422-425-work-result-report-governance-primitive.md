---
status: closed
closed: 2026-04-22
depends_on: [260, 261, 262, 406, 424]
---

# Task 425 — Work Result Report Governance Primitive

## Context

Narada's multi-agent development process still relies on chat summaries:

1. an agent is assigned a task;
2. the agent works;
3. the agent says "done" in chat;
4. the operator or architect manually interprets the report;
5. someone updates roster/task state;
6. review accepts, rejects, or creates corrective work.

This is semantically weak.

The agent's "done" is not task closure. It is a report that the assigned principal believes work is ready for review. That report should be durable evidence inside task governance, not an ephemeral chat message.

This gap is distinct from USC:

- USC or any construction operation may consume task graphs and result reports.
- USC must not invent its own completion semantics.
- The completion-report primitive belongs to Narada task governance / operator grammar.

This task introduces a first-class **Work Result Report** object.

## Goal

Define and implement a durable `WorkResultReport` primitive for task-governed work.

The chain should become:

```text
assignment claimed
  -> agent works
  -> WorkResultReport submitted
  -> task enters in_review
  -> review accepts/rejects
  -> task closes or reopens
  -> roster/principal runtime updates
```

The report is evidence, not authority.

## Required Work

### 1. Define the static report schema

Add documentation for a durable report record under `.ai/do-not-open/tasks/tasks/reports/README.md` or the existing task-governance docs if a better home exists.

The schema must include at minimum:

| Field | Meaning |
|-------|---------|
| `report_id` | Stable ID, e.g. `wrr_<timestamp>_<task>_<agent>` |
| `task_number` | Claimed task number |
| `agent_id` | Reporting principal / agent |
| `assignment_id` | Active assignment being reported |
| `reported_at` | ISO timestamp |
| `summary` | Human-readable result summary |
| `changed_files` | Array of changed paths reported by the agent |
| `verification` | Array of focused verification commands/results |
| `known_residuals` | Array of known gaps, blockers, or deferred items |
| `ready_for_review` | Boolean |
| `report_status` | `submitted`, `accepted`, `rejected`, or `superseded` |

Clarify invariants:

- A report does not close a task.
- A report does not prove correctness.
- A report must be reviewable and append-only.
- A rejected report must not delete history.
- A task may have multiple reports over time.

### 2. Add task-governance helpers

Extend `packages/layers/cli/src/lib/task-governance.ts` or a focused sibling module with:

- `WorkResultReport` type
- report file path helper
- report ID creation helper
- atomic report write helper
- report loading/listing helper

Use the existing atomic write pattern.

### 3. Add `narada task report` command

Add a CLI command:

```bash
narada task report <task-number> --agent <agent-id> --summary <text> [--changed-files <csv>] [--verification <json>] [--residuals <json>]
```

Behavior:

- verify the task exists;
- verify the task is currently `claimed`;
- verify the reporting agent has the active assignment;
- write a `WorkResultReport`;
- transition task status from `claimed` to `in_review`;
- release or mark the assignment as completed using existing assignment semantics, or explicitly document why assignment release remains separate;
- update roster state for the agent to `done`;
- fail without mutation if validation fails.

Do not accept a report for an unclaimed task.

### 4. Integrate review with reports

Update `narada task review` behavior or documentation so review records can reference a `report_id`.

Minimum acceptable implementation:

- review command accepts optional `--report <report-id>`;
- if provided, validates that the report exists and belongs to the reviewed task;
- accepted review marks report `accepted`;
- rejected review marks report `rejected`;
- task lifecycle remains governed by review result.

If full status mutation is too large, document the residual precisely and create a follow-up task. Do not overclaim.

### 5. Update agent execution contract

Update `.ai/task-contracts/agent-task-execution.md`:

- Agents must submit a WorkResultReport instead of relying on chat as completion evidence once the command exists.
- Chat summaries may mirror the report but are not authoritative.
- Reports must include focused verification, changed files, and known residuals.
- Review remains separate from reporting.

### 6. Add focused tests

Add focused CLI/lib tests covering:

- report succeeds for active assignment and moves task to `in_review`;
- report fails for unclaimed task;
- report fails when a different agent reports;
- report writes atomically;
- review accepts report and closes task;
- review rejects report and reopens task;
- multiple reports are preserved append-only.

Use focused tests only. Do not run broad suites unless a focused failure requires escalation.

## Non-Goals

- Do not build USC-specific completion semantics.
- Do not make reports authoritative closure.
- Do not add distributed locking for multiple simultaneous reporters.
- Do not integrate live Kimi/Codex APIs.
- Do not change Site runtime behavior.
- Do not rename existing task statuses unless strictly required.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Execution Notes

- **`WorkResultReport` schema** documented in `.ai/do-not-open/tasks/tasks/reports/README.md` with full field table and invariants.
- **`task-governance.ts` helpers** added:
  - `WorkResultReport` interface
  - `createReportId()`, `getReportPath()`, `saveReport()`, `loadReport()`, `listReportsForTask()`
  - `ReviewRecord` extended with optional `report_id`
- **`narada task report` command** implemented in `packages/layers/cli/src/commands/task-report.ts`:
  - Validates task exists and is `claimed`
  - Validates reporting agent has active assignment
  - Writes atomic `WorkResultReport` to `.ai/do-not-open/tasks/tasks/reports/`
  - Transitions task `claimed` → `in_review`
  - Releases assignment with reason `completed`
  - Updates roster: agent status → `done`, `last_done` → task number
  - All validation happens before any mutation
- **`narada task review` updated** in `packages/layers/cli/src/commands/task-review.ts`:
  - Accepts optional `--report <report-id>`
  - Validates report exists and belongs to reviewed task
  - Accepted review marks report `accepted`; rejected review marks report `rejected`
  - Review record stores `report_id` reference
- **`main.ts` wired** `narada task report <task-number>` command.
- **Agent execution contract** updated in `.ai/task-contracts/agent-task-execution.md` with WorkResultReport requirements and invariants.
- **Focused tests** added:
  - `test/commands/task-report.test.ts`: 8 tests (success, unclaimed failure, wrong agent, missing summary, nonexistent task, invalid verification, invalid residuals, multiple reports append-only)
  - `test/commands/task-review.test.ts`: 5 new tests (accept report, reject report, report belongs to different task, report not found, plus existing 8 = 13 total)
- **Verification**: 21/21 focused tests pass; `pnpm verify` passes (task file guard, typecheck, build, charters, ops-kit).

## Acceptance Criteria

- [x] `WorkResultReport` schema is documented.
- [x] CLI can submit a report for an actively claimed task.
- [x] Report submission transitions task to `in_review` without closing it.
- [x] Report submission updates assignment/roster state coherently.
- [x] Review can reference and accept/reject a report.
- [x] Rejected reports remain durable history.
- [x] Agent execution contract distinguishes report from review and closure.
- [x] Focused tests cover success and failure paths.
- [x] No USC-specific completion semantics are introduced.
- [x] No derivative task-status files are created.

## Suggested Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/task-report.test.ts test/commands/task-review.test.ts
pnpm verify
```

If `pnpm verify` is already known clean and only CLI/task-governance files changed, prefer the focused test command plus task-file guard.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
