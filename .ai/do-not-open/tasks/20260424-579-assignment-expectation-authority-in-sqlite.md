---
status: closed
created: 2026-04-24
depends_on: [550, 573]
closed_at: 2026-04-24T17:00:00.000Z
closed_by: a3
governed_by: task_close:a3
---

# Task 579 - Assignment Expectation Authority In SQLite

## Goal

Define the canonical authority model for expected task duration, check-in thresholds, and overrun handling so Narada can monitor assigned work without duplicating truth across markdown, agent-kind priors, and runtime state.

## Why

Narada now has:

- recommendation,
- governed assignment,
- dispatch packet / pickup,
- lease expiry and heartbeat,
- release reasons such as `abandoned` and `budget_exhausted`.

But it still does not have a first-class answer to:

- how long an assigned task is expected to take,
- when Narada should check in with an agent,
- and what authority surface owns that timing truth.

The key design constraint is already clear:

- there must be **one authoritative place** for live expectation state,
- and that place should be the **assignment instance in SQLite**,
- not task markdown and not a `task x agentkind` matrix.

Task-level complexity hints and agent-kind priors may still exist, but only as inputs used to derive the assignment expectation. They must not become competing authorities.

## Required Work

1. Define the canonical authority object for execution expectation:
   - task,
   - agent,
   - assignment instance,
   - and any dispatch / execution-attempt subordinate state.
2. Make explicit why the primary authority belongs to the **assignment** and not to:
   - task markdown,
   - task-level estimate fields,
   - or `task x agentkind` as a live truth surface.
3. Define the authoritative SQLite shape for assignment expectation, including at least:
   - expected duration,
   - first check-in due,
   - max silence window,
   - escalation threshold,
   - expectation source / derivation basis,
   - current overrun state.
4. Define which inputs may seed the expectation non-authoritatively:
   - task complexity hint,
   - task family / chapter locality,
   - agent-kind prior,
   - recent assignment history.
5. Define the no-duplication rule:
   - live expectation truth may exist in only one authoritative place,
   - any markdown or read-model rendering is projection, not co-equal state.
6. Define the governed follow-up path when expectation is exceeded:
   - check-in required,
   - blocker surfaced,
   - continuation / takeover / release / operator escalation.
7. State explicit non-goals:
   - no opaque runtime ML,
   - no second authoritative estimate in markdown,
   - no pretending lease heartbeat is the same thing as progress expectation.
8. Record verification or bounded blockers.

## Acceptance Criteria

- [x] Assignment instance is explicit as the single authoritative place for live expectation state
- [x] SQLite field shape for assignment expectation is explicit
- [x] Task-level and agent-kind priors are classified as non-authoritative inputs only
- [x] No-duplication rule across SQLite and markdown is explicit
- [x] Overrun / check-in / escalation path is explicit
- [x] Non-goals are explicit
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

1. Decision artifact created at `.ai/decisions/20260424-579-assignment-expectation-authority-in-sqlite.md`
2. Authority model:
   - `task_assignments` row is the single authoritative boundary for live expectation
   - Markdown effort hints, task-level estimate fields, and `task × agentkind` matrices are non-authoritative inputs only
   - Dispatch packet lease is mechanical liveness, not progress expectation — the two must never be conflated
3. SQLite schema defined with 6 new columns on `task_assignments`:
   - `expected_duration_minutes`
   - `first_check_in_due_at`
   - `max_silence_minutes`
   - `escalation_threshold_minutes`
   - `expectation_source`
   - `overrun_state`
4. Overrun state machine: `within_expectation` → `check_in_due` → `overrun` → `escalated`
5. No-duplication rule includes lint rule IDs and severity levels
6. Deferred work catalogued for Tasks 580–583+ (schema migration, derivation function, check-in surface, operator override CLI, workbench pane, historical averages)

## Verification

- Decision artifact exists and covers all 8 required work items
- `pnpm verify`: 5/5 steps pass
- `pnpm typecheck`: all 11 packages clean
