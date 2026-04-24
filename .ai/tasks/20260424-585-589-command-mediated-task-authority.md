---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T16:40:00.000Z
closed_by: a2
governed_by: task_close:a2
reservation: 585-589
---

# Command-Mediated Task Authority

## Goal

Define the end-state regime in which Narada tasks are no longer worked through direct markdown or SQLite access, but only through sanctioned Narada commands.

## Why This Chapter Exists

Narada has already moved toward SQLite lifecycle authority and anti-duplication, but the live working surface is still too arbitrary.

Today, the system still silently permits some mix of:

- direct task reading from markdown,
- direct task editing,
- direct task creation by file authoring,
- direct SQLite inspection or mutation,
- and command-mediated operations.

That means the real task authority regime is still smeared across:

- command operators,
- markdown files,
- SQLite tables,
- and local human/agent habits.

The target state is stronger:

- no direct task editing,
- no direct task reading,
- no direct task creation,
- no direct SQLite access for task operations,
- and every task operation performed through one sanctioned Narada command surface.

This chapter exists to de-arbitrarize that target state completely before implementation proceeds.

## Chapter DAG

```text
585 Command-Mediated Task Authority Boundary Contract
586 Task Observation Command Surface Contract
587 Task Mutation Command Surface Contract
588 Direct-Access Prohibition And Sanctioned-Substrate Contract
585, 586, 587, 588 ─→ 589 Command-Mediated Task Authority Closure
```

## Tasks

| Task | Title | Purpose |
|------|-------|---------|
| 585 | Command-Mediated Task Authority Boundary Contract | Define the boundary and eliminate ambiguity about what object actually owns task interaction |
| 586 | Task Observation Command Surface Contract | Define sanctioned task-reading/inspection surfaces so direct file/DB reading is no longer part of normal task work |
| 587 | Task Mutation Command Surface Contract | Define sanctioned task creation, amendment, transition, and closure operators so direct editing is no longer part of task work |
| 588 | Direct-Access Prohibition And Sanctioned-Substrate Contract | Define what direct markdown/SQLite access is forbidden, what exceptions exist, and what "single-command driven" means |
| 589 | Command-Mediated Task Authority Closure | Close the chapter honestly and name the first implementation line |

## Closure Criteria

- [x] The authoritative task interaction regime is explicit
- [x] Observation and mutation command families are explicit
- [x] Direct markdown and SQLite access posture is explicit
- [x] "Single-command driven" meaning is explicit
- [x] Exceptions and residual debug/repair posture are explicit
- [x] First implementation line is named
- [x] Verification or bounded blockers are recorded

