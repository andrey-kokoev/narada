---
status: opened
depends_on: [1051]
---

# Task 1052 — Plan Windows operator surface adapter path

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- docs/product/user-pc-template-materialization-workflow.md
- docs/product/site-bootstrap-contract.md
- docs/concepts/polycentric-site-locus-routing.md
- docs/concepts/plural-embodiment-singular-authority.md

## Context

The originating evidence comes from Windows Terminal profiles and Komorebi/YASB operator workflow, then expanded to CLI/API agent runtime and control-channel differences. The Windows adapter path should be planned as the first concrete spatial realization, but not collapsed into the Operator Surface primitive or the whole session-binding model.

## Goal

Produce a bounded implementation plan for Windows Terminal, Komorebi, and YASB Operator Surface adapters without building them yet.

## Required Work

1. Document the Windows adapter chain: Site surface declaration -> Windows Terminal profile -> stable window title -> Komorebi focus/rule -> YASB/AHK launch affordance.
2. Document how CLI agent runtimes bind naturally to terminal Operator Surfaces, while API agent runtimes bind through ControlChannels such as chat transcripts, inbox envelopes, task evidence, and optional console projections.
3. Identify the authority locus for adapter materialization: likely User Site or PC Site, not Narada proper by default.
4. Define what evidence a materializer must produce: profile diff/export, command transcript, surface read-back, session-binding read-back, and residuals.
5. List risks: stale profile files, Windows/WSL path translation, host identity, Komorebi title matching drift, API transcript locality, and accidental external mutation.
6. Create follow-up implementation task candidates only if they belong outside Narada proper.

## Non-Goals

- Do not mutate Windows Terminal settings
- Do not create Komorebi/YASB config
- Do not assume this WSL clone owns Windows User Site authority
- Do not require API agents to have a native window identity

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

- [ ] Docs include a concrete Windows adapter posture that remains adapter-specific
- [ ] Docs distinguish CLI terminal-bound agents from API conversation-bound agents
- [ ] Authority locus for Windows materialization is explicit and not assumed to be Narada proper
- [ ] Required evidence for adapter materialization and session-binding read-back is defined
- [ ] Risks and residuals are recorded
