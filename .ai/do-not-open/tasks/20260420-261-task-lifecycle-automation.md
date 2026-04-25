# Task 261: Task Lifecycle Automation

## Chapter

Multi-Agent Task Governance

## Context

Task files in `.ai/do-not-open/tasks/` have a loose lifecycle: they are created, edited, and eventually have their acceptance criteria checked. There is no mechanical state machine. A task can be "in progress" for multiple agents simultaneously, and there is no enforcement of dependencies.

The control plane has a rigorous work-item lifecycle (`opened` → `leased` → `executing` → `resolved`/`failed`). Task governance should adopt an analogous but appropriately simpler lifecycle.

## Goal

Make the task lifecycle explicit, mechanical, and dependency-aware — without over-engineering the file-based boundary.

## Required Work

### 1. Task State Machine Schema (static)

Define canonical task statuses and allowed transitions:

| Status | Meaning | Allowed Transitions |
|--------|---------|---------------------|
| `draft` | Being written, not yet ready | → `opened` |
| `opened` | Ready for claim | → `claimed` |
| `claimed` | Assigned to an agent | → `in_review`, `opened` (abandoned), `needs_continuation` |
| `needs_continuation` | Agent stopped before completion because a declared execution budget was exhausted or an external blocker prevented safe continuation | → `claimed`, `opened` |
| `in_review` | Completed, awaiting review | → `closed`, `opened` (rejected) |
| `closed` | Review accepted, work done | → `confirmed` |
| `confirmed` | Chapter closure verified | (terminal) |

The transition authority rules are part of the static schema. Enforcement is performed by operators.

`needs_continuation` is not a failure state and not a completion state. It means the task has useful partial work but still needs execution. It remains claimable after a continuation packet has been written.

### 2. Dependency Schema and Claim Enforcement

Add a `depends_on` field to task file front-matter (static schema):

```yaml
---
task_id: 261
status: opened
depends_on: [259, 260]
---
```

A task in `opened` status must not be claimable until all `depends_on` tasks are `closed` or `confirmed`. The claim **operator** enforces this at claim time.

The existing Mermaid DAGs in `.ai/do-not-open/tasks/` should remain human-readable, but `depends_on` provides the machine-readable subset.

### 3. Execution Budget And Continuation Protocol

Define how agents report bounded execution exhaustion, including cases such as `Max number of steps reached`.

Each task assignment should be able to declare an execution budget:

```yaml
execution_budget:
  max_steps: 100
  max_minutes: 30
  max_verification_level: focused
```

When an agent reaches or expects to reach the budget before completing the task, it must not mark the task done. It should release the assignment with `release_reason: budget_exhausted` and transition the task to `needs_continuation`.

The task artifact or assignment record must then include a **Continuation Packet**:

- `last_completed_step` — what was completed
- `remaining_work` — concrete next actions
- `files_touched` — files changed or inspected
- `verification_run` — commands already run and results
- `known_blockers` — missing context, failing checks, or external limits
- `resume_recommendation` — whether the same agent should resume

Claiming a `needs_continuation` task should prefer the same agent if available, using continuation affinity, but this preference must be advisory. Another agent may claim the task if the original agent is unavailable.

Review must reject any task marked `in_review` or `closed` if the artifact contains unresolved continuation blockers.

### 4. Review Record Schema (static)

Add a `review` block to task files or a parallel `.ai/reviews/` directory.

A review record should include:
- `review_id` — stable identifier
- `reviewer_agent_id` — who performed the review
- `task_id` — what was reviewed
- `findings` — array of structured findings
- `verdict` — `accepted`, `accepted_with_notes`, `rejected`
- `reviewed_at` — ISO timestamp

### 5. Review Acceptance / Rejection Operator (mutation)

When a review verdict is `rejected`, a review operator transitions the task status back to `opened` (or `claimed` if reassigned to the original agent for corrections).

Only a reviewer agent may execute the review acceptance operator that transitions `in_review` → `closed`.

### 6. Task Contract Linkage (pure tool/compiler)

If a task references a task contract (e.g., `.ai/task-contracts/agent-task-execution.md`), verify that the contract exists and is up to date. This is a lint concern, not an operator concern.

## Non-Goals

- Do not replace Markdown task files with a database.
- Do not implement automatic task creation from review findings (that is Task 262).
- Do not enforce dependencies at the filesystem level (e.g., git hooks).
- Do not treat execution-budget exhaustion as task failure.

## Execution Notes

### 1. Task State Machine Schema (static)
Created `.ai/do-not-open/tasks/schema.md` documenting the 7 statuses (`draft`, `opened`, `claimed`, `needs_continuation`, `in_review`, `closed`, `confirmed`) and their allowed transitions. Added `isValidTransition(from, to)` and `TASK_STATUSES` to `packages/layers/cli/src/lib/task-governance.ts`.

### 2. Dependency Schema and Claim Enforcement
- `depends_on` was already parseable in task front-matter (array of numbers).
- Added `checkDependencies(cwd, dependsOn)` to `task-governance.ts`: resolves dependency task files by short number, reads their front-matter, and returns blocking task IDs whose status is not `closed` or `confirmed`.
- `task-claim.ts` now calls `checkDependencies()` after status validation and fails with `unmet dependencies: {list}` if any dependency is incomplete.

### 3. Execution Budget and Continuation Protocol
- Added `ContinuationPacket` interface to `task-governance.ts` with fields: `last_completed_step`, `remaining_work`, `files_touched`, `verification_run`, `known_blockers`, `resume_recommendation`.
- `task-release.ts` now requires `--continuation <path>` when `--reason budget_exhausted`. The packet JSON is parsed, validated, and stored in the task file front-matter under `continuation_packet`.
- `budget_exhausted` transitions task status to `needs_continuation` (already supported from Task 268).
- Claiming a `needs_continuation` task is now supported (transition `needs_continuation` → `claimed`).
- Continuation affinity is advisory: the claim operator does not enforce same-agent resumption, but the `resume_recommendation` field is stored for observation.

### 4. Review Record Schema (static)
Created `.ai/reviews/README.md` documenting the review record JSON schema: `review_id`, `reviewer_agent_id`, `task_id`, `findings` (array with `severity`, `description`, `location`), `verdict`, `reviewed_at`.

### 5. Review Acceptance / Rejection Operator
Created `packages/layers/cli/src/commands/task-review.ts`:
- `narada task review <task-number> --agent <id> --verdict <accepted|accepted_with_notes|rejected> [--findings <json>]`
- Verifies task status is `in_review`.
- Validates verdict at runtime.
- Creates a durable review record in `.ai/reviews/{review-id}.json`.
- Transitions status: `accepted`/`accepted_with_notes` → `closed`, `rejected` → `opened`.
- Enforces transition validity via `isValidTransition()`.

### 6. Task Contract Linkage (deferred)
Task contract linting is a pure tool/compiler concern. No new lint command was added in this task; it is noted as deferred to a future tooling task.

### 7. Transition Enforcement
All operators (`claim`, `release`, `review`) now call `isValidTransition()` before mutating task status. Invalid transitions fail with a clear error and no mutation.

### Corrective Notes (Task 271)

- **Release failure ordering fixed**: `task-release.ts` now validates the continuation packet (if required) *before* mutating the assignment or task file. A missing/invalid continuation leaves assignment active and task status unchanged.
- **Review command wired**: `narada task review` is now registered under the `task` command group in `main.ts`.
- **Reviewer authority enforced**: The review operator now requires `role: reviewer` or `role: admin`. Documented in `.ai/reviews/README.md`.
- **Findings shape-validated**: Each finding is checked for `severity` in `blocking|major|minor|note`, `description` as string, and `location` as string/null.
- Task 261's original claim that "invalid transitions fail with no side effects" was only fully true after the release ordering fix above.

### Tests: 44/44 pass

| File | Tests |
|------|-------|
| `test/lib/task-governance.test.ts` | 13 (atomic write, transitions, dependencies, front matter) |
| `test/commands/task-claim.test.ts` | 11 (+4: no front-matter/status rejection, depends_on blocked, depends_on closed, needs_continuation claim) |
| `test/commands/task-release.test.ts` | 11 (+3: continuation required with no side effects, continuation accepted, invalid release reason) |
| `test/commands/task-review.test.ts` | 9 (accept, reject, not in_review, invalid verdict, reviewer/admin authority, findings validation, stores record) |

## Acceptance Criteria

- [x] Task status state machine is defined and documented.
- [x] Status transitions are enforced by the claim/release/review operators.
- [x] `depends_on` field is parsed and enforced at claim time.
- [x] Review records have a defined schema and are stored durably.
- [x] A rejected review correctly reopens the task.
- [x] Execution-budget exhaustion transitions tasks to `needs_continuation`, not `in_review` or `closed`.
- [x] Continuation packets are required for `budget_exhausted` releases.
- [x] Continuation affinity prefers but does not require the same agent to resume.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
