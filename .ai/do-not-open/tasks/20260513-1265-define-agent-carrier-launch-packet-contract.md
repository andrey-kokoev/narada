---
status: confirmed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T23:33:33.378Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T23:33:33.943Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: agent_finish
---

# Define Agent Carrier launch packet contract

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260513-1264-1266-agent-carrier-factorization.md

## Goal

Create a product-level v0 contract artifact for carrier launch packets that Codex, Kimi, and a future Narada-native carrier can all satisfy.

## Context

The concept doc names launch packet fields. A structured contract artifact is needed so current agent-start launch results and future carrier implementations can converge on a comparable shape.

## Required Work

1. Add a product contract JSON artifact for the v0 Agent Carrier launch packet.
2. Include required fields for agent identity, session ids, startup command, environment, tool approval, native execution policy, result packet/sentinel, PC runtime reference, and non-claims.
3. Name the supported carrier implementations and explicitly include Narada-native carrier as planned.

## Non-Goals

- Do not make the contract a published package API in this task.
- Do not migrate existing carrier outputs in this task.
- Do not add secrets or host-specific runtime state to the contract artifact.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A JSON contract artifact exists under docs/product with schema narada.agent_carrier.launch_packet_contract.v0.
- [x] The contract lists Codex, Kimi, and Narada-native carrier kinds.
- [x] The contract distinguishes native execution policy from policy-aware MCP tool approval.
