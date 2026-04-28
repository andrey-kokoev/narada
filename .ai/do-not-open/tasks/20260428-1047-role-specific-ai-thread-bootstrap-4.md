---
status: opened
depends_on: [1046]
---

# Task 1047 — Expose role bootstrap inspection command

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- packages/layers/cli/src/commands/sites.ts
- packages/layers/cli/src/commands/resume.ts
- packages/layers/cli/src/lib/cli-output.ts
- docs/product/site-bootstrap-contract.md

## Context

Fresh AI threads need a stable way to get the right role bootstrap without relying on chat memory. Generated AGENTS.md is durable, but operators also need a command that extracts the Architect or Builder bootstrap text for copy/paste or tool injection.

## Goal

Add a bounded CLI read surface that shows the correct AI thread bootstrap contract for a Site role.

## Required Work

1. Add a read-only Site command such as narada sites agent-bootstrap <site-id-or-root> --role architect|builder, or the closest coherent existing command placement.
2. The command must read generated Site contract/config and output bounded human/json text for the selected role.
3. Reject unknown roles instead of falling back silently.
4. Do not mutate task, inbox, Site, lifecycle, or runtime state.
5. Document how Operator uses the command to initiate a fresh Architect or Builder thread.

## Non-Goals

- Do not launch agents automatically
- Do not create an infinite role manager
- Do not enforce role permissions at runtime

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

- [ ] CLI exposes a read-only role bootstrap command or equivalent surface
- [ ] The command returns distinct Architect and Builder bootstrap outputs
- [ ] Unknown role input is rejected with a clear error
- [ ] The command performs no mutation and has bounded output
- [ ] Docs include usage examples
