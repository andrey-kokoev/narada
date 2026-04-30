---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T14:17:24.070Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests, typecheck/build, and bounded live send trial prove observer alias resolution, unknown-recipient repair output, missing binding deferral, and no expansion of Observer authority.
closed_at: 2026-04-30T14:17:30.958Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Make Observer reachable through operator-surface send aliases

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1121-1121-observer-surface-addressability.md

## Goal

Ensure the admitted Observer role can be addressed through the same operator-surface message path as Architect and Builder, so Observer can perform bounded coherence observations on request.

## Context

An Architect trial attempted to send Observer a bounded coherence question about joined operator-surface status projections. The User Site carrier rejected recipient `observer` because aliases only included Bob, Narada architect, and Narada builder. Narada proper admits an `observer` identity, but the runtime/User Site addressability projection is incomplete.

## Required Work

1. Inspect Narada proper operator-surface identities, User Site aliases, runtime bindings, and generated Site bootstrap outputs for Observer.
2. Add or repair the canonical Observer alias/addressing projection so `observer` and/or `Narada observer` resolve to the admitted Observer identity.
3. Ensure missing runtime binding produces a clear deferred bind command rather than unknown-recipient failure.
4. Add or update tests/fixtures for observer alias resolution, unknown recipient behavior, and runtime-locus deferral.
5. Verify by dry-running or sending a bounded Observer message through the sanctioned operator-surface send path without building/reviewing tasks.

## Non-Goals

- Do not make Observer a Builder, reviewer, assigner, closer, or implementation mutator.
- Do not hardcode volatile window handles in Narada proper.
- Do not bypass User/PC runtime-locus authority for live bindings.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Observer can be addressed by a canonical alias through the operator-surface send path
- [x] Unknown-recipient output lists Observer when Observer is admitted but unbound or gives a precise admission repair command when not admitted
- [x] Missing Observer runtime binding returns a bind/deferred-bind command rather than alias failure
- [x] Tests cover observer alias resolution and missing binding posture
- [x] Verification records a bounded Observer message trial without granting Observer build or review authority
