---
status: closed
depends_on: []
criteria_proved_by: builder
criteria_proved_at: 2026-04-28T23:09:26.053Z
criteria_proof_verification:
  state: unbound
  rationale: Docs define distinct Architect and Builder thread bootstrap contracts, preserve Operator authority and trace substrate limits, reject uninhabited extra roles, and verification passed via lifecycle export plus pnpm verify.
closed_at: 2026-04-28T23:09:35.519Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1044 — Specify role-specific AI thread bootstrap contracts

## Goal

Define the admitted Architect and Builder thread bootstrap contracts without adding speculative roles or collapsing Operator authority.

## Context

Narada currently generates Site AGENTS.md files for fresh architect threads only. Inhabited Evolution has now admitted a Builder role by real use, but bootstrap contracts, Site governance coordinates, and generated guidance still reflect the older single-agent model. This task is architecture/specification only and should not implement generated Site behavior.

## Required Work

1. Inventory the current fresh-thread bootstrap model and identify where it assumes architect-only execution.
2. Define a compact bootstrap contract grammar for inhabited roles: Operator, Architect, Builder, and Trace substrate.
3. Specify Architect responsibilities, limits, and default first actions in a fresh thread.
4. Specify Builder responsibilities, limits, and default first actions in a fresh thread.
5. Define the handoff grammar: Operator pressure -> Architect spec/review -> Builder execution/report -> Architect or Operator admission, with no speculative roles admitted.
6. Document non-goals and deferred roles explicitly as possibility/proposal/residual only.

## Non-Goals

- Do not implement CLI commands
- Do not modify generated AGENTS.md
- Do not admit inspector, clerk, PM, or superintendent as active roles

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Docs define Architect and Builder thread bootstrap contracts as distinct admitted roles
- [x] Docs preserve Operator as owner/client authority and trace substrate as evidence, not a thinking role
- [x] Docs state that no additional role is active until inhabited by real operation evidence
- [x] Docs include default fresh-thread first actions for Architect and Builder
- [x] No CLI behavior or Site generation is changed by this task
