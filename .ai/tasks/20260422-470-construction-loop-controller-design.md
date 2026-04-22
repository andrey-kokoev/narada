---
status: closed
depends_on: [463, 465, 468, 469]
closed_at: 2026-04-22T17:45:00.000Z
closed_by: codex
---

# Task 470 — Construction Loop Controller Design

## Context

Narada now has the operators needed for task-governed multi-agent development:

- `narada task roster show/assign/review/done/idle`
- `narada task recommend`
- `narada task promote-recommendation`
- `narada task evidence`
- `narada task graph`
- `narada chapter status` / closure surfaces once Task 469 lands
- PrincipalRuntime bridge from task governance

But the operator still manually performs the control loop:

```text
observe roster -> inspect graph -> choose next task -> assign agent -> wait -> mark done -> inspect evidence -> route review -> close or correct -> repeat
```

That loop is now the highest visible operator burden. Narada has the pieces, but not the controller that coordinates them under explicit policy.

This task designs the **Construction Loop Controller**: a bounded operator-owned loop for advancing Narada's own task graph without collapsing recommendation into authority.

## Goal

Define the smallest coherent controller that can assist or automate the Narada self-build loop while preserving:

- recommendation remains advisory;
- assignment promotion is governed;
- human/operator policy remains explicit;
- reviews are separated from implementation;
- evidence gates completion;
- agents remain observable state machines, not invisible subprocesses.

This task is design-first. It may define implementation slices, but should not implement a long-running autonomous controller unless the design proves a safe minimal slice.

## Required Work

### 1. Define controller boundary

Write a decision artifact:

```text
.ai/decisions/20260422-470-construction-loop-controller-design.md
```

It must classify the controller as one of:

- inspection-only assistant;
- recommendation assistant;
- promotion assistant requiring operator approval;
- bounded auto-promoter under narrow policy;
- full autonomous dispatcher.

For each class, state:

- what it may read;
- what it may write;
- which operators it invokes;
- what must remain human-owned;
- why more autonomy is or is not justified now.

### 2. Define minimal v0 loop

Specify the minimal v0 loop in concrete steps. Candidate:

```text
1. Read roster.
2. Read task graph.
3. Read task evidence for candidate tasks.
4. Run task recommend.
5. Produce promotion candidates.
6. If policy allows, call task promote-recommendation --dry-run.
7. Emit operator plan.
8. Stop.
```

The v0 loop should probably not auto-promote until Task 468 is reviewed and Task 469 exists. If the design recommends any auto-promotion, it must define exact hard gates.

### 3. Define policy file shape

Define a small policy artifact, e.g.:

```text
.ai/construction-loop/policy.json
```

It should include:

- allowed autonomy level;
- maximum simultaneous assignments;
- allowed agent IDs;
- review separation rules;
- blocked task ranges;
- require_operator_approval_for_promotion;
- allow_auto_review: false by default;
- dry_run_default: true by default;
- max_tasks_per_cycle;
- stale_agent_timeout_ms;
- stop_conditions.

Do not implement the policy unless the task explicitly narrows to a safe implementation slice.

### 4. Define agent state machine interaction

Describe how the controller observes and manages agents:

```text
idle -> assigned -> working -> reported -> reviewing -> done
```

Clarify:

- roster state is operational, not task truth;
- WorkResultReports/evidence are task truth inputs;
- review state must not be inferred only from chat messages;
- stuck/budget-exhausted agents must produce continuation packets or be marked with a bounded reason.

### 5. Define integration with existing operators

Map loop steps to existing commands:

| Loop Step | Existing Operator | Gap |
|-----------|-------------------|-----|
| observe agents | `task roster show` | |
| observe graph | `task graph` | |
| inspect evidence | `task evidence` | |
| recommend assignment | `task recommend` | |
| promote recommendation | `task promote-recommendation` | |
| close chapter | `chapter status/close` | pending Task 469 |

Explicitly avoid duplicating these operators.

### 6. Define implementation follow-up tasks

If design supports implementation, create no more than three follow-up tasks:

1. v0 inspect/plan command;
2. policy file + validation;
3. optional bounded promotion mode.

Each follow-up task must be self-standing and narrow.

### 7. Update docs if needed

If the design clarifies terminology, update only the minimal relevant docs:

- `.ai/task-contracts/agent-task-execution.md`
- `docs/governance/task-graph-evolution-boundary.md`
- `docs/concepts/runtime-usc-boundary.md`

Do not scatter repeated explanations across docs.

## Non-Goals

- Do not build a full autonomous dispatcher in this task.
- Do not auto-promote recommendations by default.
- Do not parse chat messages as authoritative completion.
- Do not bypass `task promote-recommendation`.
- Do not bypass `task evidence`.
- Do not replace roster, recommendation, promotion, or chapter operators.
- Do not add a web UI.
- Do not create broad task backlog unless justified by the design.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] Decision artifact exists at `.ai/decisions/20260422-470-construction-loop-controller-design.md`.
- [x] Controller autonomy class is explicitly chosen.
- [x] Minimal v0 loop is specified step-by-step.
- [x] Policy file shape is defined.
- [x] Agent state machine interaction is defined.
- [x] Existing operator integration table is complete.
- [x] Any follow-up tasks are narrow, self-standing, and no more than three.
- [x] Design explicitly preserves recommendation/authority separation.
- [x] Design explicitly prevents chat-message completion from becoming authoritative.
- [x] No implementation code is added unless a safe minimal slice is justified in the decision.

## Execution Notes

### Design Summary

Completed design-only task for the Construction Loop Controller.

**Controller autonomy class selected:** "Promotion assistant requiring operator approval" — plan-only in v0; no auto-promotion.

**Key design decisions:**
1. v0 loop is 9 steps, read-only, plan-only. It observes roster, graph, evidence, chapters, generates recommendations, filters through policy, runs dry-run promotion, and emits an operator plan.
2. Policy file `.ai/construction-loop/policy.json` defines bounds: autonomy level, max assignments, allowed/blocked agents/tasks, review separation rules, risk thresholds, stale detection, stop conditions, CCC integration.
3. Agent state machine interaction is observational only. Controller reads roster; never mutates it. Stale agents are flagged, not auto-marked done.
4. Chat messages are explicitly excluded as authoritative evidence.
5. Controller delegates 100% to existing operators; no logic duplication.

**Documents updated:**
- `.ai/decisions/20260422-470-construction-loop-controller-design.md` — design decision artifact
- `.ai/task-contracts/agent-task-execution.md` — added construction loop controller section
- `docs/governance/task-graph-evolution-boundary.md` — added §11 construction loop controller

**Follow-up tasks created:**
- **Task 471** — v0 Inspect/Plan Command (`narada construction-loop plan`)
- **Task 472** — Policy File + Validation (`policy show/init/validate`)
- **Task 473** — Bounded Auto-Promotion Mode (`construction-loop run`, deferred)

**Registry updated:** `last_allocated: 473`; reservations for 471–472–473 active; 470 released.

**No implementation code added.** Design-only task per acceptance criteria.

## Verification

- Verified decision artifact exists at `.ai/decisions/20260422-470-construction-loop-controller-design.md`.
- Verified decision selects **promotion assistant requiring operator approval** as the v0 autonomy class.
- Verified the decision defines the 9-step v0 loop, policy schema, agent state machine interaction, and existing-operator integration table.
- Verified follow-up task files exist and are exactly three: Task 471, Task 472, and Task 473.
- Verified no implementation code was added by this task; changes are design/task/documentation artifacts only.
