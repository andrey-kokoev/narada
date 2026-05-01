---
status: opened
---

# Formalize OperatorSurfaceDelivery state machine

## Chapter

state-machine-formalization

## Goal

Make operator-surface message delivery safe and explicit through a delivery-state machine.

## Context

This task formalizes the state model behind task 1175 so OSM delivery cannot interrupt active Operator typing or hide queued/failed delivery posture.

## Required Work

Define OperatorSurfaceDelivery states and transitions; integrate requested, queued_waiting_for_idle, delivered, refused, expired, fallback_to_inbox, and explicit_interrupt handling into OSM send/inspect surfaces; preserve evidence and tests.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Delivery state is persisted or emitted as durable evidence for every send attempt.
- [ ] Active Operator input gates delivery before focus/window/input mutation.
- [ ] Queued, refused, expired, and fallback_to_inbox are distinct results.
- [ ] Urgent explicit interruption is authority-gated and visible in evidence.
- [ ] Tests cover idle, active typing, expiry, fallback, and cross-desktop posture.
