---
number: 2206
governed_by: unknown
status: closed
tags: authority-matrix, consent, invokable-intelligence, ontology-remediation, policy, site-loci
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2214@v2
creation_payload_sha256: c65e516df5485afaf16625d05485afd81cf2fb460225a18923834b5bed0a1570
idempotency_key: invokable-intelligence-remediation-source-2214-narada-proper-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"user-site-task-2214-narada-proper-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-19T17:31:36.529Z
---

# Define the intelligence policy authority matrix

## Goal

Remove the contradiction between locus ownership and resolver composition by specifying which policy and assertion kinds each authority locus may originate and how non-negotiable principal consent is represented.

## Context

Destination-side materialization of User Site task #2214. The accepted posture assigns target-Site governance/defaults, User-Site preferences, and Host/execution-Site feasibility, but prior tasks imply that all loci can issue all hard constraints. A typed authority matrix is required; user consent/prohibitions must not be disguised as ranking preferences.

Source authority: User Site task #2214.
Destination authority: Narada proper Site, D:\code\narada.

## Required Work

Define policy/assertion kinds and the loci authorized to originate, materialize, supersede, and revoke each kind.
Separate target governance constraints, principal consent/prohibitions, User preferences, target defaults, and execution feasibility.
Define conflict and composition semantics: which constraints accumulate, which values rank, and which combinations are invalid rather than overridden.
Define default as an explicit low-priority fallback policy or otherwise formalize its distinct semantics.
Update resolver input/output provenance and refusal reason contracts to expose authority decisions.
Add positive and negative fixtures for attempted cross-locus overreach.

## Non-Goals

Do not use generic source priority or last-writer-wins.
Do not allow materialization to promote a preference into governance authority.
Do not equate user preference with user consent.

## Execution Notes


Implemented a machine-readable authority matrix separating target governance, principal consent/prohibition, User preferences, target defaults, execution feasibility, declared capability, and observed capability. Added origin/materialize/supersede/revoke authority checks, identity checks, cross-locus escalation diagnostics, canonical resolver phases, and resolver-facing provenance/refusal contracts. Exported the module from the package root.

## Verification


Focused package TypeScript check passed (structured_command_execution:e_3a9e4031a3ea4a62800e6f7f). Four authority contract tests passed (structured_command_execution:e_dd8d47b4fde643e398f76594), including positive composition and negative cross-locus overreach/revocation identity cases.

## Acceptance Criteria

- [x] A machine-readable matrix states the authorized origin and effect of every v1 policy/assertion kind.
- [x] Target governance, principal consent, User preference, target default, and execution feasibility are distinct contract concepts.
- [x] The resolver applies hard constraints and ranking only according to the matrix.
- [x] Unauthorized policy kinds and cross-locus escalation are rejected with structured diagnostics.
- [x] Tests cover consent vetoes, target restrictions, User ranking, defaults, Host infeasibility, and conflicts.
