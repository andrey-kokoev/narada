---
status: opened
---
# Define first-time Operator success path

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1105-1109-first-time-operator-ergonomics.md

## Goal

Specify the canonical first-time Operator path from fresh Site materialization through usable agent-role surfaces without requiring documentation spelunking.

## Context

Current first-time flow is scattered across site bootstrap, site doctor, role bootstrap, operator-surface binding, inbox import/work-next, and onboarding doctrine. The Operator needs one coherent path that preserves authority-locus discipline and does not infer mutation authority from the shell, clone, or CLI binary.

## Required Work

1. Inventory existing Site bootstrap, Site doctor, agent bootstrap, operator-surface instantiate/bind, inbox import/work-next, and onboarding readiness surfaces.
2. Define the smallest canonical first-time path that a new Operator can run or inspect.
3. Specify which steps are read-only diagnosis, which steps mutate Site-local state, and which steps require explicit Operator approval.
4. Record residual gaps as follow-up acceptance criteria for subsequent tasks in this chapter.

## Non-Goals

- Do not rename existing public CLI surfaces as part of this task.
- Do not implement role-specific behavior before the canonical path is specified.
- Do not make Narada proper the authority locus for another Site's state.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] A written canonical first-time Operator path exists in product documentation or task evidence and names each authority-affecting crossing.
- [ ] The path distinguishes Operation Specification, Site/runtime locus, role identity, operator surface binding, inbox intake, work-next, and readiness proof.
- [ ] The path includes a bounded failure posture for missing dependencies, missing native SQLite bindings, stale clones, or absent operator-surface transport.
- [ ] The path states what command or command family later tasks must expose as the ergonomic front door.
- [ ] Verification uses sanctioned CLI/read surfaces only and avoids raw SQLite or direct task-file editing.
