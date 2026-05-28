---
status: confirmed
depends_on: [1440]
closed_at: 2026-05-17T00:28:32.647Z
closed_by: narada.builder2
governed_by: chapter_close:narada.builder2
closure_mode: peer_reviewed
---

# Implement Site Registry inbox message send API

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1457-1463-site-communication-surface.md

## Goal

Add guarded Site Registry routes and storage for sending typed inbox-message envelopes to a selected Site through the normal communication crossing.

## Context

The UI and chat surfaces need one shared message-send path. This path must record outbound intent, target Site, idempotency key, delivery state, and receipt state without pretending registry delivery equals target Site admission.

## Required Work

1. Add D1 schema for outbound Site communication envelopes, delivery attempts, and receipt records if existing message tables are insufficient.
2. Implement guarded POST route for sending a typed inbox envelope to a selected Site.
3. Validate target Site relation/lifecycle eligibility and configured delivery endpoint posture before accepting send.
4. Implement idempotency-key handling and bounded error payloads.
5. Expose read-only receipt/status routes for the UI.
6. Add Worker tests for valid send, missing/wrong token, invalid target, idempotency replay, delivery/admission distinction, and no direct Site/registry mutation beyond communication records.

## Non-Goals

- Do not implement chat in this task.
- Do not mutate target Site task/inbox state directly.
- Do not store raw secrets in D1.
- Do not require live network delivery in unit tests.

## Execution Notes

- Added D1 migration
  `packages/site-registry-cloudflare/migrations/0004_site_registry_outbound_communications.sql`
  for outbound Site communication records, delivery attempts, and distinct
  delivery/admission receipt JSON.
- Added guarded route `POST /api/site-communications/send`, using the existing
  Site Registry message token. The route validates target Site relation
  eligibility, HTTPS delivery endpoint posture, capability ref presence,
  idempotency key, and raw-secret exclusion before recording communication
  state.
- Added read-only status/receipt routes:
  `GET /api/site-communications/:communication_id` and
  `GET /api/site-communications/:communication_id/receipt`, guarded by the
  read token.
- Implemented idempotency replay by `source.ref` plus `idempotency_key`.
- Kept v0 delivery non-live in tests: delivery receipt is
  `recorded_not_delivered`, `live_network_attempted: false`, and
  `target_site_mutated: false`.
- Kept delivery receipt and target admission receipt distinct. Admission starts
  as `pending_target_site_admission`; cloud delivery is explicitly not local
  admission.
- Updated Site Registry Cloudflare README and migration README with the new
  route/schema posture.
- Extended Worker boundary tests for valid send, unauthorized/missing/wrong
  token, invalid target, invalid delivery endpoint, idempotency replay,
  read-only status/receipt routes, and no direct target Site/registry relation
  mutation beyond communication records.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 4 files, 56
  tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- `git diff --check -- packages/site-registry-cloudflare/src/index.ts
  packages/site-registry-cloudflare/test/worker-boundary.test.ts
  packages/site-registry-cloudflare/migrations/0004_site_registry_outbound_communications.sql
  packages/site-registry-cloudflare/README.md
  packages/site-registry-cloudflare/migrations/README.md
  .ai/do-not-open/tasks/20260517-1458-implement-site-registry-inbox-message-send-api.md`
  passed.
- `narada verify suggest --files ...` returned `pnpm verify` as the only
  baseline suggestion.
- `pnpm verify` still fails on the pre-existing unrelated CLI output admission
  guard in `sites-register.ts:69`, `sites-register.ts:85`, and
  `sites-register.ts:141`; the task file guard passes.

## Acceptance Criteria

- [x] Guarded message-send API exists and records communication state.
- [x] Delivery receipt and admission receipt are distinct in schema and responses.
- [x] Idempotency replay is tested.
- [x] Unauthorized sends are refused.
- [x] Tests prove no direct target-Site mutation path.
