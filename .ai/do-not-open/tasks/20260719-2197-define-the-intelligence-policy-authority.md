---
number: 2197
governed_by: unknown
status: deferred
tags: authority-matrix, consent, invokable-intelligence, ontology-remediation, policy, site-loci, superseded
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2214@v1
creation_payload_sha256: b61f3dd78b71207f2c495de349edbeadda48e995b282d32a00957f0d1c11d303
idempotency_key: invokable-intelligence-remediation-source-2214-narada-proper-v1
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":null,"site_root":"D:\\code\\narada","correlation_key":"user-site-task-2214"}
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

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] A machine-readable matrix states the authorized origin and effect of every v1 policy/assertion kind.
- [ ] Target governance, principal consent, User preference, target default, and execution feasibility are distinct contract concepts.
- [ ] The resolver applies hard constraints and ranking only according to the matrix.
- [ ] Unauthorized policy kinds and cross-locus escalation are rejected with structured diagnostics.
- [ ] Tests cover consent vetoes, target restrictions, User ranking, defaults, Host infeasibility, and conflicts.
