---
status: closed
depends_on: [1049]
criteria_proved_by: builder
criteria_proved_at: 2026-04-28T23:47:33.168Z
criteria_proof_verification:
  state: unbound
  rationale: Site governance docs now include operator_surfaces and session_bindings with minimal fields, explicit advisory/materialization posture, adapter/channel examples, and no authority/capability grant. Generated Site config remains backward compatible by declaring empty arrays for Sites without surfaces or bindings. Focused tests and pnpm verify passed.
closed_at: 2026-04-28T23:47:42.210Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1050 — Add Site operator surface declaration shape

## Goal

Extend Site governance/product documentation with declarative operator_surfaces and session binding metadata that remain orientation and recovery metadata, not authority.

## Context

Once Operator Surface and SessionBinding are defined, Sites need a declarative place to say which surfaces are expected or preferred for a role/workflow and how agent runtimes/channels bind to them. This should sit adjacent to embodiments and agent role contracts, not replace them.

## Required Work

1. Design an operator_surfaces coordinate or equivalent shape for Site governance examples.
2. Design an optional session_bindings or equivalent shape relating AgentRuntime, ControlChannel, OperatorSurface, Site, role, task/chapter, and continuity references.
3. Include fields for id, purpose, site_id, role_id, workflow/locus binding, embodiment_id, adapter, launch, focus/window identity, placement hints, recovery posture, runtime id, channel kind, and continuity artifacts.
4. Document that declarations are advisory/orienting unless admitted through a separate materialization command, session lifecycle command, or external adapter.
5. Show how Windows Terminal, Komorebi, YASB, VS Code, browser profile, MCP console, daemon panels, API conversations, transcripts, and inbox envelopes are adapter/channel examples, not the primitive.
6. Preserve backward compatibility for Sites without declared surfaces or session bindings.

## Non-Goals

- Do not require every Site to declare surfaces
- Do not add secrets or capabilities to surface declarations
- Do not build adapter-specific schema exhaustively
- Do not require every agent runtime to have a spatial UI surface

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Site governance docs include operator_surfaces shape with minimal fields
- [x] Site governance docs include session binding shape or explicitly defer it with a precise residual
- [x] Docs state surfaces do not grant mutation, effect, or capability authority
- [x] Docs distinguish surface/session declaration from adapter materialization and runtime authority
- [x] Existing Site governance examples remain coherent for Sites without surfaces
