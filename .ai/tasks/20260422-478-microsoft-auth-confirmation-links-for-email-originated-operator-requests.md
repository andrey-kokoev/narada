---
task: 478
title: Microsoft-auth confirmation links for email-originated operator requests
status: closed
created: 2026-04-22
closed: 2026-04-22
depends_on:
  - 267
  - 284
  - 477
mode: planning
---

# Task 478: Microsoft-auth confirmation links for email-originated operator requests

## Context

Narada must allow email to initiate operator-looking requests without treating email as authority.

Current conclusion:

- Email address alone is not sufficient authority.
- Microsoft/Entra identity can strengthen authority only when Narada verifies an authenticated identity assertion, not merely a `From:` header.
- Therefore the coherent path is:

```text
email -> recognized operator contact -> pending audited operator request -> Microsoft-auth confirmation -> execute through canonical operator-action path
```

This task implements that path. It must not create direct email commands.

## Goal

Add a confirmation-link mechanism where a recognized operator contact can initiate an operator request by email, but mutating authority is granted only after successful Microsoft/Entra authentication through a confirmation link.

## Required Work

### 1. Config model

Add operation config support for operator contacts and confirmation providers.

Recommended shape:

```json
{
  "operator_contacts": [
    {
      "principal_id": "andrey",
      "channel": "email",
      "address": "andrey@kokoev.name",
      "identity_provider": "microsoft_entra",
      "tenant_id": "e00277ba-c14e-4130-b0d9-bec1f70f47d4",
      "entra_user_id": "00000000-0000-0000-0000-000000000000",
      "may_open_operator_requests": true,
      "may_confirm_actions": [
        "approve_draft_for_send",
        "reject_draft",
        "mark_reviewed",
        "handled_externally",
        "trigger_sync",
        "request_redispatch"
      ]
    }
  ],
  "confirmation_providers": {
    "microsoft_entra": {
      "tenant_id": "e00277ba-c14e-4130-b0d9-bec1f70f47d4",
      "client_id": "...",
      "client_secret_env": "NARADA_MS_CONFIRM_CLIENT_SECRET",
      "redirect_base_url": "http://127.0.0.1:8791"
    }
  }
}
```

Rules:

- `operator_contacts[].address` may identify who can open a pending request.
- `operator_contacts[].entra_user_id` or equivalent verified Entra object id must be required for confirmation authority.
- `may_confirm_actions` must be action-specific. Do not grant wildcard authority.
- Unknown confirmation provider types must fail config validation.
- Update `config.schema.json` generation.

### 2. Persistence

Add durable confirmation challenge records.

Minimum fields:

- `challenge_id`
- `scope_id`
- `operator_action_request_id`
- `principal_id`
- `provider`
- `state_hash`
- `nonce_hash`
- `created_at`
- `expires_at`
- `confirmed_at`
- `consumed_at`
- `status`: `pending | confirmed | expired | rejected | consumed`
- `failure_reason`

Requirements:

- Challenge tokens must be single-use.
- Store hashes of state/nonce tokens, not raw tokens.
- Expired challenges must not execute.
- Consumed challenges must not execute twice.

### 3. Pending request creation from email-derived input

Create a function that admits an email-originated operator request as pending audit material.

Input should include:

- `scope_id`
- `source_message_id`
- `from_address`
- requested operator action payload
- parsed rationale / source text

Behavior:

- If `from_address` is not a configured `operator_contact` with `may_open_operator_requests: true`, create no operator request.
- If recognized, create `operator_action_requests` row with `status: pending`.
- `requested_by` should be the configured `principal_id`, not raw email alone.
- The request must not execute at this step.
- The returned object should include a confirmation URL or enough data for a mail reply/draft to contain the link.

### 4. Microsoft auth routes

Add daemon control routes under the control namespace, not the observation namespace.

Suggested routes:

```text
POST /control/scopes/:scope_id/operator-requests/:request_id/confirmation-link
GET  /control/auth/microsoft/start?challenge_id=...
GET  /control/auth/microsoft/callback
```

Requirements:

- The start route redirects to Microsoft authorization endpoint with state and nonce.
- The callback exchanges auth code for tokens using configured client id/secret.
- Verify token claims:
  - tenant id matches configured tenant/provider
  - audience matches configured client id
  - object id / subject matches `operator_contacts[].entra_user_id`
  - nonce matches challenge
  - token is not expired
- On successful verification, execute via existing `executeOperatorAction()` only.
- Do not add a second mutation path.
- Record audit evidence linking:
  - source message id
  - operator action request id
  - challenge id
  - principal id
  - provider subject/object id

### 5. Operator UX

For a pending email-originated operator request, Narada should be able to draft or surface:

```text
Confirm this action:
<local-or-site confirmation link>

This link requires Microsoft sign-in as <principal_id>.
```

The link must be short-lived.

If Narada is not reachable publicly, document local-only behavior:

- On local daemon / Windows Site: link may be `http://127.0.0.1:<port>/...` and only works on the operator machine.
- On Cloudflare Site: link may be public, but must still require Microsoft auth and challenge verification.

### 6. Documentation

Update:

- `SEMANTICS.md`: email-originated operator request is input/proposal; Microsoft-auth confirmation is authority.
- `AGENTS.md`: add invariant forbidding direct email commands.
- `docs/product/operator-loop.md`: show how operator confirmation links fit daily use.
- `docs/product/tool-catalog-binding.md`: clarify that write tools such as `sonar.git.write` require confirmed operator action, not email alone.

## Non-Goals

- Do not implement direct command execution from email.
- Do not treat `From:` address as authority.
- Do not allow email to approve send, git push, config mutation, or task closure directly.
- Do not create a new operator mutation path outside `executeOperatorAction()`.
- Do not require public hosting for local-only Sites.
- Do not add broad wildcard operator authority.

## Acceptance Criteria

- [x] Config supports `operator_contacts` and Microsoft/Entra confirmation provider settings.
- [x] Config validation rejects malformed contacts, unsupported providers, and contacts without stable verified identity for confirmation.
- [x] Email-originated requests from unrecognized senders do not create executable operator actions.
- [x] Recognized operator contacts can create pending audited operator-action requests.
- [x] Pending requests do not execute until Microsoft-auth confirmation succeeds.
- [x] Microsoft callback verifies tenant, audience, nonce, expiry, and configured Entra user/object id.
- [x] Confirmation challenge tokens are single-use and expire.
- [x] Confirmed requests execute only through `executeOperatorAction()`.
- [x] Failed/expired/replayed confirmations are audited and do not mutate target state.
- [x] Docs explicitly state: email carries intent; Microsoft-auth confirmation carries authority.
- [x] Focused tests cover request creation, rejected sender, successful confirmation, wrong user, expired challenge, replayed challenge, and canonical executor routing.
- [x] `pnpm verify` passes.

## Execution Notes

Implemented the email-originated operator request path without granting email authority.

Config and schema:

- Added `operator_contacts` and `confirmation_providers.microsoft_entra` to the scope config model, loader, Zod schema, and generated `config.schema.json`.
- Contacts require stable principal, email address, Microsoft/Entra tenant and object id, and action-specific `may_confirm_actions`.

Persistence and audit:

- Added durable `confirmation_challenges` with hashed state/nonce, expiry, status, and consumed/confirmed timestamps.
- Added `source_message_id` to `operator_action_requests` so email-originated requests preserve the source message link without changing ordinary CLI/UI operator actions.

Request admission and confirmation:

- Added `admitEmailOperatorRequest()` to admit recognized email contacts as pending operator-action requests only.
- Unrecognized senders and disallowed action types create no pending request.
- Added Microsoft/Entra confirmation helpers with token exchange/decoder seams for unit testing.
- Added daemon control routes under `/control`, including confirmation-link creation, Microsoft start redirect, and callback handling.
- Callback verification checks tenant, audience, expiry, configured Entra user/object id, and nonce-by-stored-hash before executing through `executeOperatorAction()`.

Corrective fixes applied during proof:

- Fixed callback nonce handling. The route previously passed `expectedNonce: ""`, causing valid Microsoft tokens with a real nonce to fail before the stored-hash nonce check. `expectedNonce` is now optional, and the route verifies nonce via `confirmation_challenges.nonce_hash`.
- Added `source_message_id` audit persistence. The earlier implementation accepted the field but did not store it.
- Added focused tests for rejected sender, pending request creation, action allowlist rejection, challenge expiry/replay state, and Microsoft tenant/audience/user/nonce/expiry validation.

Documentation:

- `SEMANTICS.md` now defines `email-originated operator request` and states that email carries proposal/intent while Microsoft/Entra confirmation carries authority.
- `AGENTS.md` now includes invariant `21a`, forbidding direct email authority.
- `docs/product/operator-loop.md` documents local and public confirmation-link behavior.
- `docs/product/tool-catalog-binding.md` states that emailed requests for mutating tools remain inert until confirmed and executed through the canonical operator-action path.

Bounded residual:

- The confirmation routes are unit-testable through seams, and the daemon route file typechecks. A full browser-based live Microsoft OAuth round trip remains deployment/operator validation, not a unit-test requirement.

## Verification

Focused commands executed:

```bash
pnpm --filter @narada2/control-plane exec vitest run test/unit/operator-actions/confirmation.test.ts
pnpm --filter @narada2/control-plane exec vitest run test/unit/operator-actions/confirmation.test.ts test/unit/operator-actions/executor.test.ts test/unit/observability/queries.test.ts
pnpm --filter @narada2/control-plane exec vitest run test/unit/config/load.test.ts
pnpm --filter @narada2/daemon exec vitest run test/unit/observation-server.test.ts
pnpm --filter @narada2/control-plane typecheck
pnpm --filter @narada2/control-plane build
pnpm --filter @narada2/daemon typecheck
pnpm verify
```

Results:

- Control-plane confirmation/operator/observability focused tests: 79/79 passed.
- Config load tests: 19/19 passed.
- Daemon observation-server tests: 62/62 passed.
- Control-plane typecheck: passed.
- Control-plane build and generated config schema: passed.
- Daemon typecheck: passed.
- `pnpm verify`: all 5 steps passed.

## Verification Guidance

Use focused tests first. Do not run broad suites unless focused evidence indicates a package-wide risk.

Suggested focused commands:

```bash
pnpm --filter @narada2/control-plane exec vitest run test/unit/operator-confirmation.test.ts
pnpm --filter @narada2/daemon exec vitest run test/unit/operator-confirmation-routes.test.ts
pnpm --filter @narada2/control-plane typecheck
pnpm --filter @narada2/daemon typecheck
pnpm verify
```

Live Microsoft auth is not required for unit tests. Mock token exchange and token claims verification.
