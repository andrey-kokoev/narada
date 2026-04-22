---
status: closed
depends_on: [365]
closed: 2026-04-21
---

# Task 367 — Real Graph Credential And Client Binding

## Assignment

Execute Task 367.

Use planning mode before editing because this task touches credential boundaries.

## Context

Task 360 implemented a bounded `GraphDraftSendAdapter` behind a mockable `GraphDraftClient` interface. Task 364 recorded that real Microsoft Graph API calls, token refresh, and credential binding remain deferred.

Cloudflare v1 needs a production-shaped client binding seam while preserving testability and avoiding live sends during automated verification.

## Goal

Implement the Cloudflare-side Graph credential/client binding seam for draft/send operations without requiring live credentials in tests.

## Required Work

1. Define how Cloudflare bindings/secrets provide Graph credentials or tokens.
2. Implement a real `GraphDraftClient` adapter boundary that can:
   - create a draft reply;
   - send a draft;
   - surface `draftId`, `sentMessageId`, and `internetMessageId` where available;
   - classify auth, permission, bad request, rate limit, and transient errors.
3. Keep the existing mockable `GraphDraftClient` interface usable in tests.
4. Ensure missing credentials fail closed before mutation.
5. Add focused tests with mocked fetch/client behavior:
   - missing credential binding fails terminal/auth;
   - successful draft+send maps response fields;
   - 401/403 are terminal/auth or permission as documented;
   - 429/503/timeout are retryable;
   - no test requires live Graph.
6. Update deployment docs with exact required binding names and local/mock testing posture.

## Non-Goals

- Do not perform live Graph API calls in automated tests.
- Do not wire the client into Cron deployment unless needed for focused tests.
- Do not add attachment or HTML body parity unless already trivial.
- Do not create derivative task-status files.

## Execution Notes

### Files created

- `packages/sites/cloudflare/src/effects/graph-token-provider.ts` — `GraphTokenProvider` interface, `StaticBearerTokenProvider`, `ClientCredentialsTokenProvider` with caching and invalidation.
- `packages/sites/cloudflare/src/effects/fetch-graph-draft-client.ts` — `FetchGraphDraftClient` implementing `GraphDraftClient` with real Graph semantics:
  - `createDraftReply`: `POST /users/{scopeId}/messages/{parentMessageId}/createReply`
  - `sendDraft`: `POST /users/{scopeId}/messages/{draftId}/send` — handles Graph's `202 Accepted` empty-body response gracefully; `sentMessageId` is optional.
- `packages/sites/cloudflare/src/effects/graph-client-factory.ts` — `createGraphDraftClient(env)` factory with credential resolution precedence (static bearer > OAuth client credentials) and fail-closed `GraphCredentialError`.
- `packages/sites/cloudflare/test/unit/fetch-graph-draft-client.test.ts` — 18 focused tests with mocked `global.fetch` proving factory validation, token caching, response mapping, 401/403/429 error classification, timeout/network errors, and 202 empty-body handling.

### Files modified

- `packages/sites/cloudflare/src/coordinator.ts` — extended `CloudflareEnv` with `GRAPH_ACCESS_TOKEN`, `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`.
- `packages/sites/cloudflare/src/effects/graph-draft-send-adapter.ts` — made `sentMessageId` optional in `GraphDraftClient.sendDraft` return type to accommodate Graph's 202 empty-body response.
- `docs/deployment/cloudflare-v1-productionization-boundary-contract.md` — updated §5 with exact binding names, provider descriptions, factory contract, real Graph semantics, and local/mock testing posture.

### Corrections applied during review

- `createDraftReply` changed from `POST /messages` (incorrect) to `POST /messages/{parentMessageId}/createReply` (correct Graph reply-draft semantics).
- `sendDraft` changed from unconditionally parsing JSON response to handling `202 Accepted` empty body, which is real Graph behavior.
- `sentMessageId` made optional throughout the chain so the adapter does not crash when Graph cannot provide it.

## Acceptance Criteria

- [x] Real Graph credential/client binding seam exists.
- [x] Missing credentials fail closed before mutation.
- [x] Mocked tests prove response mapping and error classification.
- [x] No automated test sends real email.
- [x] Deployment docs name required bindings/secrets.
- [x] No derivative task-status files are created.
