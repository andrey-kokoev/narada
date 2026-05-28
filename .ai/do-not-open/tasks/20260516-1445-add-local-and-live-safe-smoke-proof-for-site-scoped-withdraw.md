---
status: deferred
depends_on: [1440]
deferred_by: narada.builder
deferred_at: 2026-05-17T00:08:13.862Z
defer_reason: Task 1445 local smoke proof requires Site/relation-scoped withdrawal verifier route behavior, but task 1443, assigned to narada.builder2, still owns replacing the global withdraw-token route authentication. Current route still authenticates withdrawal via NARADA_SITE_REGISTRY_RELATION_WITHDRAW_TOKEN, so implementing 1445 now would duplicate or conflict with 1443.
unblock_condition: Resume after task 1443 lands or narada.builder is explicitly reassigned the route-auth implementation scope; then add verifier-authenticated smoke fixtures/tests against the landed route behavior.
continuation_packet:
  kind: task_defer
  deferred_by: narada.builder
  deferred_at: 2026-05-17T00:08:13.862Z
  reason: Task 1445 local smoke proof requires Site/relation-scoped withdrawal verifier route behavior, but task 1443, assigned to narada.builder2, still owns replacing the global withdraw-token route authentication. Current route still authenticates withdrawal via NARADA_SITE_REGISTRY_RELATION_WITHDRAW_TOKEN, so implementing 1445 now would duplicate or conflict with 1443.
  unblock_condition: Resume after task 1443 lands or narada.builder is explicitly reassigned the route-auth implementation scope; then add verifier-authenticated smoke fixtures/tests against the landed route behavior.
  residuals: [No 1445 code changes made after claim., Task 1444 remains in review with report wrr_c351f703_20260516-1444-add-governed-verifier-enrollment-and-rotation-posture_narada.builder.]
---

# Add local and live-safe smoke proof for Site-scoped withdrawal verifier

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1441-1447-site-registry-relation-capability-verifiers.md

## Goal

Prove the relation verifier flow locally and define bounded live verification that does not hide `narada-proper` unless explicitly requested.

## Context

The registry should be able to prove Site-scoped withdrawal capability without destructive production behavior or raw secret disclosure.

## Required Work

1. Add non-secret fixtures for verifier enrollment, successful withdrawal, wrong-Site refusal, wrong-secret refusal, revoked-verifier refusal, and duplicate retry.
2. Extend local smoke tests against fake D1/KV to prove active relation counted, verifier-authenticated withdrawal accepted, public count removed, and projection evidence retained.
3. Add live-safe verification that checks route/health/refusal posture without performing a real production withdrawal by default.
4. Document an explicit gate for any live transition test relation or `narada-proper` withdrawal proof.
5. Ensure fixtures and responses never contain raw capability secrets.

## Non-Goals

- Do not withdraw the live `narada-proper` relation by default.
- Do not publish raw verifier secrets.
- Do not claim signed-envelope readiness.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Local smoke proves Site-scoped verifier withdrawal behavior.
- [ ] Wrong Site, wrong secret, and revoked verifier refusals are covered.
- [ ] Live mutation remains explicitly gated.
- [ ] No raw secret values appear in fixtures, events, responses, or docs.
