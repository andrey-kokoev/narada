---
status: confirmed
depends_on: [1432]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T23:22:57.399Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by docs/product/site-registry-relation-lifecycle.v0.md and bounded grep/manual verification of state, visibility, transitions, purge posture, and authority limits.
closed_at: 2026-05-16T23:23:07.126Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Specify Site Registry relation lifecycle contract

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1433-1440-site-registry-relation-lifecycle.md

## Goal

Define the relation lifecycle state machine for remote-hosted Site Registry membership before adding storage or routes.

## Context

The hosted registry currently counts configured known Sites and projected telemetry. Sites also need a governed way to stop being counted without raw deletion or evidence erasure. The coherent primitive is relation lifecycle, not blind forgetting.

## Required Work

1. Ground the contract in Site factorization, Site relation ledger, Site pub/sub signal exchange, capability-governed secret management, and canonical admission/rejection posture.
2. Define relation identity, relation kinds, actor posture, idempotency keys, capability refs, transition events, and public visibility semantics.
3. Specify minimum states: candidate, active, withdrawn, retired, suppressed, and purged-as-future/high-authority.
4. Define allowed first-slice transitions, including active to withdrawn/retired and visibility suppression without deleting provenance.
5. Produce a versioned contract artifact with authority limits and residuals.

## Non-Goals

- Do not implement D1 migrations or Worker routes.
- Do not add purge behavior beyond future/high-authority specification.
- Do not change live registry behavior.

## Execution Notes

Grounded the contract in:

- `docs/product/site-relation-ledger.md`
- `docs/product/site-pubsub-signal-exchange.md`
- `docs/concepts/capability-governed-secret-management.md`
- `docs/concepts/canonical-admission-rejection-ledger.md`
- existing hosted Site Registry package and route posture

Added versioned contract artifact:

`docs/product/site-registry-relation-lifecycle.v0.md`

The contract defines:

- relation identity fields and first-slice relation kinds;
- separate relation state and visibility posture;
- state set: `candidate`, `active`, `withdrawn`, `retired`, `rejected`, `superseded`;
- visibility set: `public`, `private`, `suppressed`;
- purge as future high-authority operation, not implemented in this chapter;
- transition event schema and required fields;
- actor posture for Site-originated withdrawal and registry-owner suppression;
- first-slice transition matrix and explicit refusals;
- default public read-model rule: only `state=active` and `visibility=public`;
- D1 as live relation lifecycle substrate, JSON as evidence, KV as cache only;
- projection-only authority limits and residual implementation tasks.

No D1 migration, Worker route, live registry behavior, purge behavior, or
Cloudflare deployment was changed.

## Verification

- `rg -n "Relation State|Visibility|First-Slice Transitions|Public Read Model Rule|Storage Posture|purge|raw_secret_values_recorded" docs/product/site-registry-relation-lifecycle.v0.md` passed.
- `rg -n "state = active|visibility = public|purge|delete|cloud receipt|D1|KV" docs/product/site-registry-relation-lifecycle.v0.md` passed.
- Manual review confirmed the contract distinguishes state, visibility, provenance retention, purge, and projection-only authority limits.

## Acceptance Criteria

- [x] A versioned relation lifecycle contract artifact exists.
- [x] The contract distinguishes relation state, visibility, provenance retention, and purge.
- [x] Allowed first-slice transitions and refusals are explicit.
- [x] The contract preserves projection-only authority limits.
