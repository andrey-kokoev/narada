---
status: closed
closed_at: 2026-04-28T03:50:35.307Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

## Goal
Segment README reader routes and add an agent reconstruction specification for readers who cannot run Narada packages directly.

## Required Work
1. Add README reader segmentation near First-Run Paths for runnable evaluators, live operators, doctrine readers, corporate/perimeter-blocked readers, and agent-assisted builders.
2. Add a dedicated agent reconstruction specification that tells an internal agent how to reconstruct a Narada-compatible kernel from doctrine without importing runnable code.
3. Link the reconstruction path from README, docs/README.md, and AGENTS.md where appropriate.
4. Preserve invariants: governed crossings, zone authority, intelligence-authority separation, explicit admission, durable evidence, intent before execution, confirmation after execution, projections not authority, capability/secret separation, and Site factorization.
5. Archive the source inbox observation after completion.

## Acceptance Criteria
- README contains reader segmentation and a blocked-reader route.
- A dedicated agent reconstruction specification exists with scope, non-goals, invariants, minimal data model, minimal cycle, agent prompt, validation checks, and divergence reporting.
- docs/README.md and AGENTS.md link to the reconstruction spec.
- The docs warn that reconstruction should preserve invariants rather than mimic package names or implementation internals.
- Verification passes.

## Source Observation
Inbox envelope `env_3fbcef07-10d6-4288-8cc1-4997791de3a5` requested README reader segmentation and an agent reconstruction specification.

## Execution Notes

<!-- Record what was done, decisions made, and files changed. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->
