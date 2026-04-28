---
status: closed
depends_on: [1044]
criteria_proved_by: builder
criteria_proved_at: 2026-04-28T23:11:06.357Z
criteria_proof_verification:
  state: unbound
  rationale: Site governance docs now include agent_role_contracts for architect and builder, preserve agent_identity_contract as legacy shorthand, make anti-collapse limits explicit, and keep deferred roles non-admitted; lifecycle export and pnpm verify passed.
closed_at: 2026-04-28T23:11:15.259Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1045 — Add Site governance shape for agent role contracts

## Goal

Extend Site governance coordinates to describe role-specific agent bootstrap contracts without changing runtime authority by implication.

## Context

Site governance coordinates currently contain agent_identity_contract with a default architect name. That is insufficient for a Site that can deliberately initiate either Architect or Builder threads. The structure must remain declarative: it orients agents but does not grant mutation authority.

## Required Work

1. Design an agent_role_contracts coordinate or equivalent shape that lists currently inhabited roles only: architect and builder.
2. For each role, include role_id, bootstrap_contract path or section, default first actions, authority limits, and handoff obligations.
3. Preserve backward compatibility for existing agent_identity_contract consumers, either by deriving it from architect or keeping it as a legacy shorthand.
4. Update documentation examples for Site governance coordinates.
5. State explicitly that the coordinate is orientation metadata and does not itself grant effect or mutation authority.

## Non-Goals

- Do not add new runtime authorization semantics
- Do not add a PM/inspector/clerk role
- Do not require existing Sites to migrate immediately

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Site governance docs include role-specific agent contract shape for architect and builder
- [x] Existing agent_identity_contract semantics remain understandable and backward-compatible
- [x] Authority anti-collapse rules are explicit for role contracts
- [x] Deferred roles remain documented as not admitted
