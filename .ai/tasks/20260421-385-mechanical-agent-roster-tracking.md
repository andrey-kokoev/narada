---
status: closed
closed: 2026-04-21
depends_on: [260, 261]
---

# Task 385 — Mechanical Agent Roster Tracking

## Assignment

Implement mechanical roster tracking for multi-agent task execution.

This task exists because chat-memory roster tracking caused assignment drift. The current operator/architect must not rely on conversational memory as the source of truth for which agent is working which task.

## Read First

- `.ai/task-contracts/agent-task-execution.md`
- `.ai/tasks/20260420-260-agent-roster-and-assignment-state.md`
- `.ai/tasks/20260420-261-task-lifecycle-automation.md`
- `.ai/tasks/assignments/README.md`

## Context

Narada task-governed development now commonly involves one human operator, one architect/reviewer, and several worker agents. The current workflow tracks assignments in chat, which is lossy:

- “done” messages may omit task numbers;
- multiple agents may be idle or reviewing at once;
- assignment recommendations may drift from the actual DAG;
- blocked tasks may be suggested because current work state is not mechanically represented.

This is not a Narada runtime feature. It belongs to the task-governance/operator tooling layer.

## Goal

Create a file-backed roster state and CLI surface so assignment state is mechanically inspectable and updateable.

After this task, the architect/operator can run one command to see:

- each agent;
- current task, if any;
- current status;
- last completed/reviewed task;
- timestamp of last update.

## Required Work

1. Define canonical roster state at `.ai/agents/roster.json`.

   Required shape:

   ```json
   {
     "updated_at": "2026-04-21T18:40:00-05:00",
     "agents": {
       "a1": { "status": "reviewing", "task": 376, "last_done": null, "updated_at": "..." },
       "a2": { "status": "idle", "task": null, "last_done": 380, "updated_at": "..." }
     }
   }
   ```

   Allowed statuses:

   - `idle`
   - `working`
   - `reviewing`
   - `blocked`
   - `done`

2. Add task-governance helpers in the CLI layer.

   Suggested location:

   - `packages/layers/cli/src/lib/task-roster.ts`

   Required functions:

   - `loadRoster(rootDir): AgentRoster`
   - `saveRoster(rootDir, roster): void`
   - `updateAgentRoster(rootDir, agentId, update): AgentRoster`
   - `formatRoster(roster): string`

   Writes must be atomic (temp file + rename), consistent with existing task-governance file mutation rules.

3. Add CLI commands.

   Suggested surface:

   ```bash
   narada task roster
   narada task assign <task-number> --agent <agent-id>
   narada task review <task-number> --agent <agent-id>
   narada task done <task-number> --agent <agent-id>
   narada task idle --agent <agent-id>
   ```

   If command names conflict with existing task-governance commands, extend the existing command group rather than creating a parallel surface.

4. Preserve separation from task lifecycle authority.

   Roster updates are operator tracking. They must not replace task claim/release/review state transitions unless the command explicitly delegates to existing lifecycle operators.

   In this task:

   - `task assign` may update roster state.
   - `task done` may update roster state.
   - Do not silently mark task files closed.
   - Do not silently write review records.
   - Do not bypass existing `task claim`, `task release`, or `task review` semantics.

5. Add current roster seed.

   Create `.ai/agents/roster.json` reflecting the current known state at execution time. If current state is uncertain, record unknown agents as `idle` and avoid inventing task assignments.

6. Add focused tests.

   Tests must cover:

   - loading missing roster creates/returns an empty/default roster;
   - atomic save writes valid JSON;
   - assigning an agent records `status: "working"` and task number;
   - reviewing records `status: "reviewing"`;
   - done records `status: "done"`, clears current task, and sets `last_done`;
   - idle clears current task without changing `last_done`;
   - malformed roster fails with a clear error.

7. Document the operational rule.

   Update `.ai/task-contracts/agent-task-execution.md` or `.ai/tasks/assignments/README.md` with:

   - roster file is the source of truth for current agent assignment state;
   - assignment recommendations must read the roster before suggesting work;
   - chat updates should be translated into roster updates before further scheduling.

## Non-Goals

- Do not implement automatic scheduling.
- Do not infer DAG-ready tasks.
- Do not implement conflict-free multi-writer synchronization.
- Do not create a web UI.
- Do not mutate task files except documentation/contract updates required by this task.
- Do not create derivative task-status files.

## Execution Mode

Start in planning mode before editing. The plan must name:

- intended write set;
- invariants at risk;
- dependency assumptions;
- focused verification scope.

## Execution Notes

### Roster Schema Evolution

Extended `AgentRosterEntry` in `packages/layers/cli/src/lib/task-governance.ts` with optional operational fields:
- `status?: 'idle' | 'working' | 'reviewing' | 'blocked' | 'done'`
- `task?: number | null`
- `last_done?: number | null`
- `updated_at?: string`

The roster remains an array for backward compatibility with Task 260 code. Version bumped from 1 → 2 in `.ai/agents/roster.json`.

### CLI Surface

Used `narada task roster` as a subcommand group to avoid collision with existing `narada task review` (lifecycle review operator):

```
narada task roster show
narada task roster assign <task-number> --agent <id>
narada task roster review <task-number> --agent <id>
narada task roster done <task-number> --agent <id>
narada task roster idle --agent <id>
```

All roster commands are observation/tracking only. They do NOT claim, release, review, or close tasks.

### Files Created/Modified

- `packages/layers/cli/src/lib/task-governance.ts` — extended types + `saveRoster`, `updateAgentRosterEntry`, `formatRoster`
- `packages/layers/cli/src/commands/task-roster.ts` — new command module
- `packages/layers/cli/src/main.ts` — wired `task roster` subcommands
- `.ai/agents/roster.json` — version 2 with operational state
- `.ai/task-contracts/agent-task-execution.md` — added "Agent Roster as Assignment Source of Truth" section
- `packages/layers/cli/test/commands/task-roster.test.ts` — 12 focused tests

### Verification

- `test/commands/task-roster.test.ts`: 12 tests pass (show, assign, review, done, idle, atomic persistence, format, malformed/missing handling)
- `test/lib/task-governance.test.ts`: 22 tests pass (regression)
- `test/commands/task-claim.test.ts`: 11 tests pass (regression)
- Full CLI suite: 32 test files, 201 tests pass
- Typecheck: clean
- Manual CLI smoke: `narada task roster show` displays formatted roster correctly

### Residuals

- Pre-existing CLI build error in `console.ts` (`StuckWorkItem` type incompatibility) unrelated to this task.
- No automatic scheduling or DAG-ready inference implemented (explicitly out of scope).

## Acceptance Criteria

- [x] `.ai/agents/roster.json` exists with valid current roster state.
- [x] CLI can show roster.
- [x] CLI can mark an agent working/reviewing/done/idle.
- [x] Roster writes are atomic.
- [x] Roster updates do not silently close tasks or write review records.
- [x] Documentation states roster is the source of truth for current agent assignment state.
- [x] Focused CLI/lib tests cover the required state transitions.
- [x] No derivative task-status files are created.
