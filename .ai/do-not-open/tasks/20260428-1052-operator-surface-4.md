---
status: closed
depends_on: [1051]
criteria_proved_by: builder
criteria_proved_at: 2026-04-28T23:51:34.300Z
criteria_proof_verification:
  state: unbound
  rationale: Docs now include a concrete Windows adapter posture for Site declaration -> Windows Terminal profile -> stable title -> Komorebi -> YASB/AHK, distinguish CLI terminal-bound runtimes from API/control-channel-bound runtimes, make Windows User/PC authority locus explicit rather than Narada proper, define materializer evidence/read-back requirements, and record risks/residuals. pnpm verify passed.
closed_at: 2026-04-28T23:51:43.721Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1052 — Plan Windows operator surface adapter path

## Goal

Produce a bounded implementation plan for Windows Terminal, Komorebi, and YASB Operator Surface adapters without building them yet.

## Context

The originating evidence comes from Windows Terminal profiles and Komorebi/YASB operator workflow, then expanded to CLI/API agent runtime and control-channel differences. The Windows adapter path should be planned as the first concrete spatial realization, but not collapsed into the Operator Surface primitive or the whole session-binding model.

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

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Docs include a concrete Windows adapter posture that remains adapter-specific
- [x] Docs distinguish CLI terminal-bound agents from API conversation-bound agents
- [x] Authority locus for Windows materialization is explicit and not assumed to be Narada proper
- [x] Required evidence for adapter materialization and session-binding read-back is defined
- [x] Risks and residuals are recorded
