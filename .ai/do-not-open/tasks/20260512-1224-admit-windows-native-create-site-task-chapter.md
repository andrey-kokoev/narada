---
status: closed
closed_at: 2026-05-12T19:44:10.406Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Admit Windows-native create-site task chapter

## Chapter

Windows Native Create Site

## Goal

Create the active Narada proper chapter map for the full Windows-native create-site path.

## Context

Operator requested a chapter of tasks for easy CLI creation of Narada Sites. Existing .narada task history already implements the path through create-site task 0052; this task reconciles that into the active lifecycle.

## Required Work

Record the chapter task sequence, authority boundaries, existing implementation evidence, and no-import posture for Windows-native greenfield Site creation.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Created active lifecycle chapter `Windows Native Create Site` with tasks 1224, 1225, 1226, and 1227.
- Reconciled the existing `.narada/tasks` create-site implementation sequence into this active chapter:
  - task-0010 create-site options model design
  - task-0011 descriptor dry-run command
  - task-0012 minimal filesystem skeleton
  - task-0024 live carriers implementation
  - task-0025 live carrier CLI surface
  - task-0026 execute-live orchestration
  - task-0044 shorthand live carrier orchestration proof
  - task-0052 terminal capability assessment
- Recorded chapter evidence at `.narada/audit/windows-native-create-site-chapter.json`.
- Preserved posture: greenfield template/catalog Site creation only; no source Site runtime state import.

## Verification

- `.narada/audit/windows-native-create-site-chapter.json` exists and names tasks, source implementation tasks, operational commands, verification, terminal claim, and non-claims.
- `.narada/admission/decisions/windows-native-create-site-terminal.md` records the terminal capability decision.

## Acceptance Criteria

- [x] Chapter task sequence is durable.
- [x] Existing .narada implementation tasks are referenced without source Site state import.
- [x] Next executable chapter task is identified.
