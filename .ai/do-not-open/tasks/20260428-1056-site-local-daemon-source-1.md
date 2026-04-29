---
status: closed
depends_on: []
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T00:10:45.554Z
criteria_proof_verification:
  state: unbound
  rationale: Specification-only task: docs/product/site-local-daemon-sources.md inventories daemon source assumptions, distinguishes timer heartbeat from inbox/filesystem observation, states Canonical Inbox admission boundaries, and changes no daemon implementation. Verified with pnpm verify.
closed_at: 2026-04-29T00:11:25.752Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1056 — Specify Site-local daemon source posture

## Goal

Define the coherent source/admission posture for Project and Site-local daemons that are not mailbox verticals.

## Context

Inbox envelope env_7530976f reports that equipping the thoughts project Site with a daemon exposed a gap: timer-backed heartbeat config was accepted, but the daemon sync projector treated timer facts as mailbox-shaped and failed with Unknown event kind: undefined. The fallback mock source creates presence but not useful Site-local work. This task is architecture/specification first.

## Required Work

1. Inventory current daemon source assumptions for mailbox, timer, mock, and filesystem/source concepts.
2. Specify how a Project/Site-local daemon should admit heartbeat, inbox-drop, or filesystem observations without mailbox projection assumptions.
3. Define the authority boundary: Site-local source observation -> inert fact/envelope -> governed admission/promotion, not direct task mutation.
4. State whether timer heartbeat and inbox-drop watch are one source family or separate source families.
5. Record non-goals and residuals for adapter/runtime materialization outside Narada proper.

## Non-Goals

- Do not implement source code in this task
- Do not mutate the thoughts Site
- Do not make no-op mock source appear sufficient

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Docs define Site-local daemon source posture without mailbox-shaped assumptions
- [x] Timer heartbeat and Site-local inbox/filesystem observation paths are distinguished or explicitly unified
- [x] Authority/admission boundary is explicit and aligned with Canonical Inbox
- [x] No daemon implementation is changed in this specification task
