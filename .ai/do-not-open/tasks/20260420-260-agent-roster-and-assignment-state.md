# Task 260: Agent Roster and Assignment State

## Chapter

Multi-Agent Task Governance

## Context

Agents currently claim tasks by reading Markdown files in `.ai/do-not-open/tasks/`. There is no durable record of which agent claimed which task, when, or under what authority. Multiple agents can simultaneously attempt the same task with no collision detection.

The control plane already has a proven pattern for this: `work_item_leases` with `runner_id`, `acquired_at`, and `release_reason`. Task governance needs an analogous but simpler pattern — one where schema is static, but claim/release are operators.

## Goal

Create an explicit agent roster (static schema) and assignment operators (claim/release) for task work, modeled after the control plane lease pattern.

## Required Work

### 1. Agent Roster Schema (static)

Define a lightweight roster format. Suggested location: `.ai/agents/roster.json` or front-matter in `AGENTS.md`.

Each entry should include:
- `agent_id` — stable identifier (e.g., `kimicli`, `usc-plan`, `human-operator`)
- `role` — `deriver`, `implementer`, `reviewer`, `admin`
- `capabilities` — array of authority classes the agent may hold
- `first_seen_at` — ISO timestamp
- `last_active_at` — ISO timestamp

### 2. Task Assignment Record Format (static)

Define the assignment record shape. Suggested location: task file front-matter or a parallel `.ai/do-not-open/tasks/tasks/assignments/` directory.

An assignment record should include:
- `task_id` — references the task file
- `agent_id` — who claimed it
- `claimed_at` — ISO timestamp
- `claim_context` — optional free-text justification
- `released_at` — set when the agent completes or abandons the task
- `release_reason` — `completed`, `abandoned`, `superseded`, `transferred`

### 3. Claim Operator (mutation)

Create a CLI or script surface for claiming a task:
```bash
narada task claim <task-number> --agent <agent-id> --reason "<context>"
```

This should:
1. Check the task is in `opened` status.
2. Verify no existing unreleased assignment exists.
3. Write the assignment record atomically.
4. Update the task file status to `claimed`.

### 4. Release Operator (mutation)

Create the complementary release surface:
```bash
narada task release <task-number> --reason completed
```

This should:
1. Find the active assignment.
2. Set `released_at` and `release_reason`.
3. Transition the task status to `in_review` (if completed) or `opened` (if abandoned).

## Non-Goals

- Do not build a full runtime agent registry in the control plane.
- Do not implement real-time presence or heartbeat.
- Do not create a web UI for agent management.

## Execution Notes

### Static Schema

**Agent Roster** (`.ai/agents/roster.json`):
- Created with `version: 1`, schema URI, `updated_at`, and an `agents` array.
- Each entry carries `agent_id`, `role`, `capabilities`, `first_seen_at`, `last_active_at`.
- Initial agents: `kimicli` (implementer) and `human-operator` (admin).

**Task Assignment Record Format** (`.ai/do-not-open/tasks/tasks/assignments/README.md` + JSON files):
- One file per task: `{task-id}.json` containing `task_id` and an `assignments` array.
- Assignment shape: `agent_id`, `claimed_at`, `claim_context`, `released_at`, `release_reason`.
- Invariant documented: at most one active (unreleased) assignment per task; history is append-only.

### Operators (CLI)

**`narada task claim <task-number>`** (`packages/layers/cli/src/commands/task-claim.ts`):
- Verifies agent exists in roster.
- Finds task file by short number or full ID.
- Checks task front-matter `status: opened`.
- Verifies no active assignment exists.
- Writes assignment record and updates task status to `claimed`.
- Updates agent `last_active_at` in roster.

**`narada task release <task-number>`** (`packages/layers/cli/src/commands/task-release.ts`):
- Finds active assignment for the task.
- Sets `released_at` and `release_reason`.
- Transitions task status: `completed` → `in_review`, `abandoned`/`superseded`/`transferred` → `opened`.

### Utility Module

`packages/layers/cli/src/lib/task-governance.ts`:
- Parses and serializes YAML front-matter (`---` delimited) for task files.
- Loads/saves roster and assignment records.
- Resolves task files by short or full ID.

### Tests

`packages/layers/cli/test/commands/task-claim.test.ts` (11 tests):
- Claims opened task, writes assignment + task status update.
- Fails when already claimed, agent missing, task missing, status not opened, no front matter/status, required args missing, or dependencies not closed.
- Succeeds when dependencies are closed.
- Claims `needs_continuation` task (Task 268).

`packages/layers/cli/test/commands/task-release.test.ts` (11 tests):
- Releases as `completed` (→ `in_review`), `abandoned` (→ `opened`), and `budget_exhausted` (→ `needs_continuation`).
- Fails when no assignment record, no active assignment, invalid reason, task status not claimed, missing continuation packet, or required args missing.

`packages/layers/cli/test/lib/task-governance.test.ts` (13 tests):
- Atomic write behavior, transition validation, dependency checking, front matter parsing.

All 35 focused tests pass. Pre-existing failures in `reject-draft.test.ts` and `mark-reviewed.test.ts` (`executeOperatorAction` export mismatch) are unrelated to this task.

### Corrective Notes (Task 268)

- Assignment, task, and roster writes now use atomic write behavior (write-to-temp + rename) via `atomicWriteFile()` in `task-governance.ts`.
- Claim now requires explicit `status: opened` or `status: needs_continuation`; missing status or front matter is rejected.
- Release validates reason at runtime against an allowlist (`completed`, `abandoned`, `superseded`, `transferred`, `budget_exhausted`).
- `budget_exhausted` release reason is supported and transitions task status to `needs_continuation`.
- Release requires `--continuation <path>` (JSON packet) for `budget_exhausted` and verifies task front-matter status is `claimed` before mutation, failing with a consistency error if stale.
- Task 260 verification was corrected to reflect focused test results only, not broad package typecheck (pre-existing unrelated errors in other commands).

## Acceptance Criteria

- [x] Agent roster schema is defined and documented.
- [x] Task assignment record format is defined.
- [x] `claim` and `release` operators exist as CLI commands or scripts.
- [x] Claiming a task that is already claimed fails with a clear error.
- [x] Assignment history is durable and human-readable.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
