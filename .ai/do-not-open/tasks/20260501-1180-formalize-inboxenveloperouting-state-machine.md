---
status: opened
---

# Formalize InboxEnvelopeRouting state machine

## Chapter

state-machine-formalization

## Goal

Make inbox envelope routing transitions explicit, bounded, and side-effect-visible.

## Context

Inbox routing already has partial states, but recent work exposed slow work-next, surprising side effects, and unclear received/pending/promoted handling. This task pulls those into a clean state machine.

## Required Work

Define InboxEnvelopeRouting states and legal transitions; align received, classified, pending_crossing, promoted, archived, rejected, superseded, and failed states with CLI output, mutation evidence, and work-next behavior; add tests and docs.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Every inbox transition has a named source state, target state, actor, evidence artifact, and allowed command.
- [ ] work-next reports admissible transitions without dumping full payloads by default.
- [ ] pending/promote/triage commands report side effects and dirty-state ownership.
- [ ] Rejected and superseded envelopes remain visible as durable admission decisions.
- [ ] Tests cover legal and illegal routing transitions.
