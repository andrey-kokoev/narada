---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T16:52:22.830Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777567864946_kwlvdk
closed_at: 2026-04-30T16:54:25.043Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Resolve role-shaped agent addresses by exact-one roster cardinality

## Chapter

Operator Surface Addressability Ergonomics

## Goal

Let task and Operator Surface command paths resolve role-shaped agent addresses to a concrete agent only when the target Site roster has exactly one active agent with that role, while recording both requested and resolved identities.

## Context

Inbox envelope env_46558519-ea7d-4330-80fd-bf4ae3a38e0d reports that narada-andrey.Bob is the concrete builder-role agent in the User Site roster, while narada-andrey.builder is the role-address the Operator naturally expects. Command paths currently fail when given the role-shaped address even when exactly one roster agent has that role.

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

- [x] A canonical agent-address resolver runs before task command admission and Operator Surface sends.
- [x] Concrete agent ids remain authoritative when present in the target roster.
- [x] Role-shaped addresses resolve only when exactly one active target-Site roster agent has that role.
- [x] Zero-match and multi-match cases fail closed with concrete repair guidance and competing agent ids when applicable.
- [x] Command output and mutation evidence record requested_agent and resolved_agent where resolution occurs.
- [x] Tests cover exact-one, zero-match, multi-match, and cross-Site ambiguity cases.
