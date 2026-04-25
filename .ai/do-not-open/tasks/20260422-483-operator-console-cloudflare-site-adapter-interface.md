---
status: closed
created: 2026-04-22
owner: unassigned
depends_on: [482]
---

# Task 483 - Operator Console Cloudflare Site Adapter Interface

## Context

The established multi-Site operator surface is **Operator Console / Site Registry**. This task must preserve that existing vocabulary and boundary:

- **Operator Console**: cross-Site operator-facing observation and routed control.
- **Site Registry**: advisory inventory and routing table.
- **Site**: runtime locus that owns state and authority.

Task 482 live-bound the console for Windows Sites. Its explicit residual is Cloudflare Site live binding:

- Cloudflare Sites are remote, not filesystem-discoverable.
- They require endpoint URL registration and credentials.
- They need HTTP observation/control clients instead of local SQLite clients.

Cloudflare already has a bounded operator action surface:

- `packages/sites/cloudflare/src/index.ts`
  - `GET /status?site_id=...`
  - `POST /control/actions`
- `packages/sites/cloudflare/src/operator-actions.ts`
  - `executeSiteOperatorAction()`

The missing piece is a substrate-neutral console adapter interface and a Cloudflare adapter implementation that lets the existing console route to Cloudflare Sites without becoming hidden authority.

## Goal

Define and implement an abstract Operator Console Site adapter interface, then add a Cloudflare Site adapter that supports remote observation and audited control routing through Cloudflare's HTTP surface.

## Read First

- `docs/product/operator-console-site-registry.md`
- `docs/deployment/operator-console-site-registry-boundary-contract.md`
- `.ai/decisions/20260421-384-operator-console-site-registry-closure.md`
- `.ai/do-not-open/tasks/20260422-482-operator-console-live-site-control-and-observation.md`
- `packages/layers/cli/src/commands/console.ts`
- `packages/sites/windows/src/site-control.ts`
- `packages/sites/windows/src/observability.ts`
- `packages/sites/cloudflare/src/index.ts`
- `packages/sites/cloudflare/src/operator-actions.ts`
- `packages/sites/cloudflare/test/integration/operator-action-handler.test.ts`

## Non-Goals

- Do not rename Operator Console / Site Registry.
- Do not implement a GUI or web UI.
- Do not implement cross-Site orchestration, cycle scheduling, auto-heal, or auto-remediation.
- Do not make the Site Registry authoritative over Cloudflare Site state.
- Do not bypass Cloudflare Site HTTP observation/control endpoints.
- Do not add Cloudflare effect-execution behavior beyond existing Site-owned action surfaces.
- Do not store admin tokens in plaintext registry rows.

## Required Work

1. Define a substrate-neutral console adapter contract.
   - Add a small interface for console bindings that can provide:
     - health/status observation;
     - attention observation;
     - control client construction;
     - unsupported/credential-required results.
   - The interface must be usable by Windows and Cloudflare adapters.
   - Keep public types vertical-neutral: `site_id`, `scope_id`, `item_type`, `target_id`, `severity`, `status`.

2. Refactor console binding selection.
   - Move substrate-specific branching out of `packages/layers/cli/src/commands/console.ts` where practical.
   - Keep the CLI command as orchestration/glue, not as the owner of substrate semantics.
   - Windows behavior from Task 482 must continue to work.

3. Extend Site Registry metadata for remote Cloudflare Sites if needed.
   - Represent endpoint URL and credential reference for `variant: "cloudflare"`.
   - Credential references must not store raw tokens.
   - Registration/discovery should be explicit; do not pretend Cloudflare Sites are filesystem-discoverable.

4. Implement Cloudflare observation adapter.
   - Call the Cloudflare Site `GET /status?site_id=...` endpoint with configured auth.
   - Map the response into the console's health/status shape.
   - For attention queue v0, support what Cloudflare currently exposes. If the Cloudflare Site does not yet expose stuck work/outbound/draft detail endpoints, return bounded unsupported/empty results and record the required Cloudflare endpoint extension as a residual.

5. Implement Cloudflare control adapter.
   - Implement an HTTP `SiteControlClient` for Cloudflare that routes console `approve`, `reject`, `retry`, and supported actions to the Cloudflare Site control endpoint.
   - Preserve `ControlRequestRouter` audit logging in the registry.
   - Ensure Cloudflare Site remains responsible for validation, mutation, and Site-side operator action audit.
   - Handle auth failures, endpoint unavailable, unsupported action, and malformed response explicitly.

6. Add focused tests.
   - Unit-test adapter selection for Windows vs Cloudflare vs unsupported substrate.
   - Test Cloudflare observation mapping from `GET /status` response.
   - Test Cloudflare control routing success and rejection using mocked fetch.
   - Test auth/endpoint failures return informative errors and still preserve registry router audit where routing is attempted.
   - Preserve existing console command tests.

7. Update docs.
   - Update `docs/product/operator-console-site-registry.md` with Cloudflare live binding status.
   - Clarify that the abstract interface is a console adapter interface, not a new top-level object above Site.
   - Use the canonical terminology: Operator Console / Site Registry.

8. Record verification and residuals.
   - Record focused tests and `pnpm verify` result in this task.
   - If Cloudflare lacks detail observation endpoints, explicitly create or recommend follow-up work for those endpoints rather than faking detail in the console.

## Acceptance Criteria

- [x] A substrate-neutral Operator Console Site adapter interface exists.
- [x] `narada console` uses adapter selection rather than hardcoded Windows-only binding in command code.
- [x] Existing Windows console behavior from Task 482 remains covered by tests.
- [x] Cloudflare Sites can be registered or represented with endpoint URL plus credential reference without storing raw tokens.
- [x] Cloudflare status observation works through the Site HTTP endpoint and maps into console health output.
- [x] Cloudflare control routing uses the existing Site-owned HTTP control endpoint and preserves registry router audit.
- [x] Auth failures, unavailable endpoints, unsupported actions, and malformed responses produce informative operator-visible errors.
- [x] Documentation preserves Operator Console / Site Registry vocabulary.
- [x] Verification evidence is recorded in this task.

## Verification

```bash
cd /home/andrey/src/narada
pnpm verify
pnpm --filter @narada2/windows-site exec vitest run \
  test/unit/router.test.ts \
  test/unit/aggregation.test.ts \
  test/unit/observability.test.ts \
  test/unit/site-control.test.ts \
  test/unit/console-adapter.test.ts
pnpm --filter @narada2/cloudflare-site exec vitest run \
  test/unit/console-adapter.test.ts \
  test/integration/operator-action-handler.test.ts
pnpm --filter @narada2/cli exec vitest run test/commands/console.test.ts
```

**Results:**
- `pnpm verify`: all 5 steps passed (task-file-guard, typecheck, build, charters, ops-kit)
- Windows-site tests: 55 passed (router 11, aggregation 18, observability 15, site-control 7, console-adapter 4)
- Cloudflare-site tests: 34 passed (console-adapter 20, operator-action-handler 14)
- CLI console tests: 10 passed

## Execution Notes

- **Auth failure status mapping**: `CloudflareSiteObservationApi.getHealth()` now returns `status: "auth_failed"` (instead of `"error"`) when the Cloudflare Worker responds with HTTP 401. This allows `getCredentialRequirements()` to correctly surface an `interactive_auth_required` attention item in the console attention queue.
- **Test coverage**: Added tests for 401 → `auth_failed` mapping and for credential-requirement generation on auth failure.

### Residuals

- **Cloudflare detail observation endpoints**: The Cloudflare Worker does not yet expose `GET /scopes/:scope_id/stuck-work-items`, `GET /scopes/:scope_id/pending-outbounds`, or `GET /scopes/:scope_id/pending-drafts`. The `CloudflareSiteObservationApi` returns empty arrays for these methods. A future Cloudflare Site task should add these endpoints.
- **Multi-scope Cloudflare Sites**: v0 assumes single-site Workers. The console passes `scope_id` through to the control endpoint but does not resolve multiple scopes.
- **Cloudflare Site registration**: Explicit manual registration is required (`control_endpoint` in registry + `NARADA_CLOUDFLARE_TOKEN_*` env var). No auto-discovery.




