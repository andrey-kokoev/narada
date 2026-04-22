---
status: closed
closed: 2026-04-22
depends_on: [260, 261, 262, 407, 425, 430]
---

# Task 443 — Task Graph Evolution Boundary

## Context

The `.ai/tasks` area is no longer a loose folder of Markdown files. It is a working governance substrate:

- tasks have lifecycle states;
- agents claim and report against tasks;
- reviews accept/reject task work;
- chapters create subgraphs;
- assignment recommendations and roster state depend on task graph correctness;
- accepted learning is now recalled into task-governance commands.

Recent collision:

- Task `430` was created for active learning recall.
- Concurrent macOS/Linux chapter shaping also generated `430`-range tasks.
- Agents saw multiple Task 430 files and had to ask which one to execute.

That failure is structural. The task graph needs controlled evolution rules, not just after-the-fact cleanup.

## Goal

Define the **Task Graph Evolution Boundary**: the contract that governs how `.ai/tasks` may be created, numbered, renumbered, linked, reviewed, and evolved.

This task is design-first. It should produce the boundary contract and the follow-up implementation tasks needed to enforce it.

## Required Work

### 1. Define the task graph as a governed substrate

Create:

`docs/governance/task-graph-evolution-boundary.md`

Define `.ai/tasks` as a governed task graph substrate, not a free-form document folder.

The contract must cover:

- task identity;
- numeric allocation;
- range reservation;
- chapter DAGs;
- task lifecycle;
- dependency edges;
- blockers;
- assignment/roster relationship;
- WorkResultReport relationship;
- review relationship;
- accepted-learning relationship;
- renumbering/correction rules.

### 2. Define task identity invariants

At minimum:

- A task number must map to exactly one executable task file.
- Filename task number must match `# Task NNN` heading.
- Chapter DAG ranges must not collide with executable task numbers outside the chapter.
- `depends_on` and `blocked_by` must reference existing task numbers, unless explicitly marked external/deferred.
- A task file must be self-standing.
- A task must not be both executable and deferred/closed in conflicting places.
- No derivative task-status files may exist.

### 3. Define range reservation protocol

Specify how chapter-shaping tasks reserve task-number ranges before creating subtasks.

The protocol must address:

- where reservations are stored;
- who/what may create a reservation;
- how a reservation expires or is released;
- how concurrent chapter creation avoids collision;
- how partial chapter creation is recovered;
- how a task generator chooses next available number.

This should build on existing `.ai/tasks/.registry.json` if present. If the registry is insufficient, document required changes.

### 4. Define renumbering/correction operator

Specify how to correct collisions after they occur.

Rules:

- renumbering must patch filenames, headings, `depends_on`, `blocked_by`, chapter DAGs, task tables, closure references, and any obvious decision references;
- renumbering must preserve history by noting the correction in the affected original task or decision;
- renumbering must not create derivative status files;
- renumbering should be performed by an explicit operator or script, not ad hoc shell edits.

### 5. Define lint/check requirements

Design a task graph lint command that detects:

- duplicate task numbers;
- filename/heading mismatch;
- stale internal task numbers after renumbering;
- unresolved `depends_on`;
- unresolved `blocked_by`;
- chapter DAG range mismatch;
- derivative status files;
- report/review references to missing task numbers;
- assignment files referencing missing tasks;
- learning artifacts referencing missing tasks if source kind is task.

Decide whether this should extend the existing task-file guard or be a separate command.

### 6. Create implementation tasks

Create follow-up task files with the next available non-colliding numbers after this task.

At minimum:

1. task graph lint implementation;
2. task range reservation implementation;
3. renumbering/correction operator implementation;
4. chapter generation command hardening;
5. closure/review integration.

Each task must be self-standing and must not collide with existing task numbers.

### 7. Update governance contracts

Update:

- `.ai/task-contracts/agent-task-execution.md`
- `AGENTS.md` if needed

The update must tell agents:

- do not create task numbers by inspecting `ls | tail`;
- use the reservation/allocation protocol once implemented;
- if a collision is detected, stop and invoke the correction path;
- if no implementation exists yet, record the collision and correct it explicitly.

## Non-Goals

- Do not implement all enforcement in this task.
- Do not rewrite existing task history.
- Do not rename unrelated historical tasks.
- Do not build a database-backed task tracker.
- Do not merge task governance with Site runtime state.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] `docs/governance/task-graph-evolution-boundary.md` exists and is self-standing.
- [x] The contract defines `.ai/tasks` as a governed task graph substrate.
- [x] Task identity invariants are explicit.
- [x] Range reservation protocol is specified.
- [x] Renumbering/correction operator requirements are specified.
- [x] Lint/check requirements are specified.
- [x] Follow-up implementation tasks exist and are non-colliding.
- [x] Agent execution contract tells agents not to allocate task numbers by `ls | tail`.
- [x] No enforcement implementation is overclaimed.
- [x] No derivative task-status files are created.

## Execution Notes

- Created `docs/governance/task-graph-evolution-boundary.md` covering all 10 required sections (task identity, lifecycle, allocation/reservation, dependencies, assignment/report/review/learning relationships, renumbering, lint, agent contract, non-goals, related docs).
- Created 5 follow-up implementation tasks (449–453) with non-colliding numbers, each self-standing with acceptance criteria.
- Updated `.ai/task-contracts/agent-task-execution.md` with a new "Task Number Allocation" section.
- Updated `AGENTS.md` Task File Policy to reference the new boundary contract.
- Historical collisions discovered during exploration: Task 003 (2 files), Task 124 (2 files), Task 288 (2 files). These are documented for Tasks 449 and 451 to address.
- No derivative status files created.
- No enforcement implementation overclaimed (all enforcement deferred to 449–453).

## Verification

```bash
test -f docs/governance/task-graph-evolution-boundary.md
# PASS

rg -n "duplicate task|range reservation|renumber|filename|heading|depends_on|blocked_by|derivative" docs/governance/task-graph-evolution-boundary.md .ai/task-contracts/agent-task-execution.md
# PASS — all terms found in boundary doc; reservation rule found in execution contract

find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
# PASS — no output (no forbidden derivative files)
```

## Suggested Verification

```bash
test -f docs/governance/task-graph-evolution-boundary.md
rg -n "duplicate task|range reservation|renumber|filename|heading|depends_on|blocked_by|derivative" docs/governance/task-graph-evolution-boundary.md .ai/task-contracts/agent-task-execution.md
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

If only Markdown files are changed, do not run broad test suites.
