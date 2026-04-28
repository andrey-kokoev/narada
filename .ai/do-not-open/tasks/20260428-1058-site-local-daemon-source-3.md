---
status: opened
depends_on: [1057]
---

# Task 1058 — Add Site-local inbox-drop or filesystem source design path

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- docs/concepts/canonical-inbox.md
- packages/layers/cli/src/commands/inbox.ts
- packages/layers/control-plane/src/sources
- docs/product/site-bootstrap-contract.md

## Context

The useful daemon for a Project Site is often not a mailbox sync loop but watching Site-local authored material such as .narada/.ai/inbox-drop or filesystem observations. That path should produce inert canonical inbox/file-drop candidates, not direct work mutations.

## Goal

Define and, if small enough, implement the first coherent Site-local inbox-drop/filesystem source for project-locus daemons.

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

- [ ] A coherent Site-local inbox-drop/filesystem source path is specified
- [ ] The path preserves inert arrival before admission/promotion
- [ ] Implementation is either delivered with tests or deferred as a precise Builder task
- [ ] Docs explain how Project/Site-local daemons should use the path
