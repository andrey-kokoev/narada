---
status: confirmed
depends_on: [1432]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T23:40:10.573Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by the purge posture artifact, lifecycle and route contract links, explicit distinction between withdraw/suppress/retire and purge, current purge/delete refusal tests, package tests, build, and explicit future purge/privacy residuals.
closed_at: 2026-05-16T23:40:17.313Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Record purge posture as future high-authority operation

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1433-1440-site-registry-relation-lifecycle.md

## Goal

Specify purge as a future operation with stronger authority requirements, without implementing it in this chapter.

## Context

Forgetting can mean withdrawal from active projection, suppression from public view, or destructive purge. Purge destroys re-derivation material and needs a separate authority posture.

## Required Work

1. Write a short purge posture artifact distinguishing retire/withdraw/suppress from purge.
2. Define minimum future requirements for purge: actor authority, retention policy, evidence of request, dry-run preview, and post-purge receipt.
3. Update relation lifecycle docs to mark purge unsupported in this implementation chapter.
4. Add tests or contract constants refusing purge transitions if a transition API already exists.
5. Record residual task recommendations for future privacy/retention work.

## Non-Goals

- Do not delete D1 rows, KV projections, or event history.
- Do not add purge route implementation.
- Do not claim privacy compliance beyond posture specification.

## Execution Notes

- Added `docs/product/site-registry-purge-posture.v0.md`.
- The posture artifact distinguishes `withdraw`, `suppress`, and `retire` from future destructive `purge`.
- Defined minimum future purge requirements: actor authority, exact scope, retention policy, request evidence, dry-run preview, confirmation law, post-purge receipt, re-derivation impact statement, and raw-secret exclusion.
- Linked the purge posture from `docs/product/site-registry-relation-lifecycle.v0.md` and `docs/product/site-telemetry-hosted-route-storage-contract.v0.md`.
- Confirmed the current transition API already refuses purge/delete and the fixture/tests cover that refusal.
- Rewrote relation lifecycle residuals so completed chapter slices are no longer listed as residuals; future purge/privacy work remains explicit.

## Verification

- `rg -n "Site Registry Purge Posture|Minimum Future Purge Requirements|purge|delete|withdraw|suppress|retire|NARADA_SITE_REGISTRY_LIVE_RELATION_MUTATION|site_registry_relation_purge_not_supported" ...` found the posture artifact, links, current refusal, tests, and live gate.
- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 4 files, 47 tests.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.

## Acceptance Criteria

- [x] Purge posture artifact exists.
- [x] Current implementation explicitly refuses or omits purge.
- [x] Retire/withdraw/suppress remain distinct from purge.
- [x] Residual future work is explicit.
