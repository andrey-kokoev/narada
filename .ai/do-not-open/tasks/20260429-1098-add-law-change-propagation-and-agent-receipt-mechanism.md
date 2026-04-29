---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T23:58:10.734Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented durable Git-visible law change records under .ai/law/changes and agent law receipt records under .ai/law/receipts. Added narada law change add/list/unread/ack/status commands with dry-run support, JSON/human output, role-scoped unread detection, and law_update_required admission blocking in task claim and task finish. Documented the Operator/Architect/Builder/Observer loop and recorded/acknowledged the law change introduced by this task.
closed_at: 2026-04-29T23:58:35.463Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add law change propagation and agent receipt mechanism

## Chapter

Agent Law Propagation

## Goal

Create a first-class mechanism for propagating Narada law changes to active agents and recording explicit agent read/ack receipts before affected work continues.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Define durable law change records for changes to AGENTS.md
- [x] SEMANTICS.md
- [x] role docs
- [x] task contracts
- [x] Site governance coordinates
- [x] and other configured law sources
- [x] including change id
- [x] files
- [x] commit
- [x] summary
- [x] scope
- [x] required roles
- [x] issuer
- [x] and issued time.
- [x] Define durable agent law receipt records with agent id
- [x] role
- [x] session or operator surface identity when available
- [x] change id
- [x] read/ack time
- [x] status
- [x] and optional questions or blockers.
- [x] Expose CLI commands to list law changes
- [x] show unread changes for an agent
- [x] record read/ack receipt
- [x] and report law-sync status in compact human and JSON formats.
- [x] Add a work-admission check path so claim
- [x] execute
- [x] report
- [x] close
- [x] or other affected task commands can block with law_update_required when mandatory law changes are unread.
- [x] Preserve authority boundaries: law receipt proves the agent acknowledged reading the law change
- [x] not that the agent may mutate or bypass role/locus/capability rules.
- [x] Support dry-run/preview where applicable and avoid direct SQLite access by agents outside sanctioned commands.
- [x] Add focused tests covering law change creation/discovery
- [x] agent ack
- [x] unread blocker
- [x] acknowledged pass-through
- [x] role-scoped applicability
- [x] and JSON output.
- [x] Document the operational loop for Operator
- [x] Architect
- [x] Builder
- [x] and Observer
- [x] including the ergonomic command agents should run after startup or before normal duty loop.
