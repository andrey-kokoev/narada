---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T22:05:22.531Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:05:06.160Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 878 — Define Canonical Inbox semantics

## Goal

Document Canonical Inbox as Narada's typed envelope intake zone, distinct from email mailbox and from task/action authority.

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

- [x] SEMANTICS.md defines Canonical Inbox as the single durable intake zone for arrived items.
- [x] The definition states that Inbox envelopes are inert and cannot do work.
- [x] The definition separates source, kind, authority, status, and promotion.
