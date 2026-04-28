---
status: opened
depends_on: []
---

# Task 1056 — Specify Site-local daemon source posture

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- packages/layers/control-plane/docs/00-kernel.md
- SEMANTICS.md
- docs/product/site-bootstrap-contract.md
- docs/product/unattended-operation-layer.md
- docs/concepts/canonical-inbox.md

## Context

Inbox envelope env_7530976f reports that equipping the thoughts project Site with a daemon exposed a gap: timer-backed heartbeat config was accepted, but the daemon sync projector treated timer facts as mailbox-shaped and failed with Unknown event kind: undefined. The fallback mock source creates presence but not useful Site-local work. This task is architecture/specification first.

## Goal

Define the coherent source/admission posture for Project and Site-local daemons that are not mailbox verticals.

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

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Docs define Site-local daemon source posture without mailbox-shaped assumptions
- [ ] Timer heartbeat and Site-local inbox/filesystem observation paths are distinguished or explicitly unified
- [ ] Authority/admission boundary is explicit and aligned with Canonical Inbox
- [ ] No daemon implementation is changed in this specification task
