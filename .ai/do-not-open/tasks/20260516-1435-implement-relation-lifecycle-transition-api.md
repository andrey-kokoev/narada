---
status: confirmed
depends_on: [1432]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T23:31:58.494Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by protected /api/relations/transition implementation, separated withdraw/admin relation capability refs, D1 write tests, unauthorized/invalid refusal tests, duplicate idempotency tests, no-token-echo checks, package tests, and build.
closed_at: 2026-05-16T23:32:09.412Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Implement relation lifecycle transition API

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1433-1440-site-registry-relation-lifecycle.md

## Goal

Add protected Worker routes for relation lifecycle transitions such as withdraw, retire, and suppress.

## Context

Sites need a governed remote crossing to ask the registry to stop counting them. Registry owner suppression is a separate visibility action. Both need capability checks and refusal posture.

## Required Work

1. Add protected route or routes for relation lifecycle transition requests using bearer capability refs.
2. Validate transition payload schema, actor Site id, target Site id, relation kind, idempotency key, and requested transition.
3. Require separate capability posture for Site-originated withdrawal and registry-owner suppression.
4. Return bounded cloud receipt only; do not claim local Site admission.
5. Add tests for accepted withdraw/retire/suppress transitions, unauthorized refusal, invalid transition refusal, duplicate idempotency, and no token echo.

## Non-Goals

- Do not add public unauthenticated mutation.
- Do not implement purge.
- Do not mutate local Narada proper Site config or task lifecycle.

## Execution Notes

Implemented protected relation lifecycle transition route:

`POST /api/relations/transition`

The route validates transition payloads, actor standing, idempotency key,
relation identity, requested transition, resulting state/visibility, capability
refs, reason codes, and evidence refs.

Capability posture is separated:

- `NARADA_SITE_REGISTRY_RELATION_WITHDRAW_TOKEN` for Site-originated withdrawal;
- `NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN` for registry-owner/admin actions
  such as suppress, retire, activate, reject, or reactivate.

The route writes through the task-1434 D1 helper
`recordSiteRegistryRelationTransition`, returns bounded cloud receipts, and
preserves projection-only no-authority fields. It does not mutate represented
Site authority, local inbox, local task lifecycle, or purge/delete provenance.

Updated:

- `packages/site-registry-cloudflare/src/index.ts`
- `packages/site-registry-cloudflare/src/deploy-readiness.ts`
- `packages/site-registry-cloudflare/test/worker-boundary.test.ts`
- `packages/site-registry-cloudflare/README.md`
- `packages/site-registry-cloudflare/wrangler.example.jsonc`
- `docs/product/site-telemetry-hosted-route-storage-contract.v0.md`

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed, 43 tests.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- `rg -n "/api/relations/transition|RELATION_WITHDRAW|RELATION_ADMIN|purge/delete|relation_transition_response" packages/site-registry-cloudflare docs/product/site-telemetry-hosted-route-storage-contract.v0.md` passed.
- Tests cover accepted withdrawal, accepted suppression, unauthorized refusal without state write, purge/delete refusal, duplicate idempotency, separate capability refs, and no token echo.

## Acceptance Criteria

- [x] Protected transition API exists.
- [x] Unauthorized and invalid transitions are refused without state mutation.
- [x] Accepted transitions write D1 relation state and event evidence.
- [x] Responses are bounded cloud receipts and do not echo secrets.
