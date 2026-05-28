---
status: claimed
depends_on: [1440]
---

# Implement Site-scoped withdrawal verifier authentication

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1441-1447-site-registry-relation-capability-verifiers.md

## Goal

Replace global withdraw-token authorization with Site/relation-scoped verifier authentication for withdrawal transitions.

## Context

A withdrawal request should prove possession of the verifier for the target Site relation. Payload self-consistency alone must not authorize withdrawal for arbitrary Sites.

## Required Work

1. Change `POST /api/relations/transition` withdrawal auth to verify the supplied secret against the active verifier for `(relation_id, site_id, capability_ref, relation_withdraw)`.
2. Keep registry-owner/admin actions on their existing admin capability path unless a later chapter replaces them.
3. Bind transition events to the capability ref/verifier id used without recording raw secrets.
4. Refuse wrong secret, wrong Site, wrong relation, revoked verifier, missing verifier, unsupported capability family, and purge/delete.
5. Add tests proving Site A credentials cannot withdraw Site B, wrong/revoked secrets refuse, duplicate idempotency still works, and no token/verifier material is echoed.

## Non-Goals

- Do not add destructive purge.
- Do not require signed Site envelopes in v0.
- Do not expose verifier records through public read APIs.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Withdrawal no longer depends on one global withdraw Worker secret.
- [ ] Withdrawal requires a matching active Site/relation verifier.
- [ ] Cross-Site and revoked/wrong-secret attempts refuse without state mutation.
- [ ] Tests cover verifier auth and no-secret leakage.
