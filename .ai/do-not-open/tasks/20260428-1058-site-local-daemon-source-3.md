---
status: closed
depends_on: [1057]
criteria_proved_by: architect
criteria_proved_at: 2026-04-29T00:20:09.101Z
criteria_proof_verification:
  state: unbound
  rationale: Focused inbox-drop source and daemon startup tests passed; typecheck passed. The implementation emits inert filesystem.change observations only and leaves Canonical Inbox admission/promotion separate.
closed_at: 2026-04-29T00:20:30.105Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1058 — Add Site-local inbox-drop or filesystem source design path

## Goal

Define and, if small enough, implement the first coherent Site-local inbox-drop/filesystem source for project-locus daemons.

## Context

The useful daemon for a Project Site is often not a mailbox sync loop but watching Site-local authored material such as .narada/.ai/inbox-drop or filesystem observations. That path should produce inert canonical inbox/file-drop candidates, not direct work mutations.

## Required Work

1. Decide whether the first source should be config-level filesystem observation, inbox-drop observation, or CLI-only ingestion reused by daemon.
2. Specify source config fields, fact/envelope shape, idempotency, and admission behavior.
3. If implementation is bounded, add a read-only/inert source path that detects inbox-drop candidates and routes through canonical inbox/admission surfaces.
4. If implementation is not bounded, create a follow-up Builder task with exact files and tests.
5. Add tests or specification examples for the selected path.

## Non-Goals

- Do not directly create tasks from watched files
- Do not bypass Canonical Inbox
- Do not watch arbitrary filesystem trees without explicit bounds

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A coherent Site-local inbox-drop/filesystem source path is specified
- [x] The path preserves inert arrival before admission/promotion
- [x] Implementation is either delivered with tests or deferred as a precise Builder task
- [x] Docs explain how Project/Site-local daemons should use the path
