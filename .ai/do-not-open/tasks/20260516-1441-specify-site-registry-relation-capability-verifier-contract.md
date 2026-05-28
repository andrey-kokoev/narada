---
status: confirmed
depends_on: [1440]
amended_by: narada.builder
amended_at: 2026-05-16T23:59:47.644Z
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-16T23:59:54.175Z
criteria_proof_verification:
  state: unbound
  rationale: Versioned relation capability verifier contract and fixtures created; verified by JSON fixture parsing and git diff whitespace checks.
closed_at: 2026-05-17T00:44:53.070Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
confirmed_by: narada.architect
confirmed_at: 2026-05-18T17:35:08.698Z
---

# Specify Site Registry relation capability verifier contract

## Chapter

Site Registry Relation Lifecycle / Site-Scoped Capability Verifiers

## Goal

Define the governed contract for Site-scoped relation withdrawal capability verifier enrollment and use before changing Worker auth.

## Context

The current hosted registry has a relation lifecycle transition route, but Site-originated withdrawal is still shaped around a single global withdraw token. Doctrine requires capability, secret, route, relation evidence, and admission to remain distinct. The first task makes the missing authority shape explicit: a Site-scoped capability verifier is enrolled under governed authority, then used as evidence for a withdrawal crossing; it is not a raw password column on the public relation row.

## Required Work

1. Ground the contract in capability-governed secret management, canonical capability consent registry, governed crossing, verifiable envelope trust, Site relation ledger, and canonical routing/addressing.
2. Define the surfaces and their authority: relation current state, private capability verifier records, transition events, capability grants/credential refs, and enrollment evidence.
3. Specify enrollment separately from use: who may create the first verifier for a Site relation, what evidence is required, and what remains unsupported in v0.
4. Define the verifier record schema, request authentication posture, raw-secret exclusion rule, rotation/revocation posture, idempotency posture, and refusal posture.
5. Produce a versioned doctrine/product artifact that gives Builder enough detail to implement the D1 migration and auth changes in later tasks.

## Non-Goals

- Do not implement D1 migrations or Worker routes in this task.
- Do not set or rotate Cloudflare secrets.
- Do not store raw secret values or prescribe a live secret value.
- Do not replace registry-owner/admin suppression credentials in this slice.
- Do not implement signed Site envelopes; name them only as future posture if needed.

## Execution Notes

- Read the task, prior relation lifecycle chapter closure, and grounding doctrine for capability-governed secret management, capability consent registry, governed crossing, verifiable envelope trust, Site relation ledger, and canonical routing/addressing.
- Inspected the current hosted registry relation transition posture, including the global relation withdraw token and relation transition payloads.
- Added `docs/product/site-registry-relation-capability-verifier.v0.md`.
- The contract distinguishes relation current state, transition events, capability grants, credential refs, private verifier records, and enrollment evidence.
- The contract specifies enrollment separately from use, including first-verifier bootstrap by registry owner/operator in v0 and unsupported self-enrollment/signed-envelope-only bootstrap.
- The contract defines verifier record fields, request authentication posture, raw-secret exclusion, replay/idempotency, rotation/revocation, refusal posture, and future implementation boundaries.
- Added fixtures for valid verifier record, valid enrollment event, valid withdrawal request, and cross-Site verifier refusal.

## Verification

- `Get-ChildItem docs\product\fixtures\site-registry-relation-capability-verifier\*.json | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json | Out-Null; $_.Name }` passed for 4 fixtures.
- `git diff --check -- docs/product/site-registry-relation-capability-verifier.v0.md docs/product/fixtures/site-registry-relation-capability-verifier` passed.

## Acceptance Criteria

- [x] A versioned contract artifact exists for relation capability verifiers.
- [x] The contract distinguishes relation evidence, capability grant, credential reference, verifier storage, and transition admission.
- [x] Enrollment authority and first-verifier bootstrap posture are explicit.
- [x] Raw-secret, replay, rotation, revocation, and cross-Site refusal rules are explicit.
- [x] The artifact identifies the next implementation task boundaries without overclaiming live readiness.
