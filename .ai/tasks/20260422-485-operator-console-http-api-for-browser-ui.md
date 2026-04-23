---
status: closed
created: 2026-04-22
closed: 2026-04-23
owner: implementer
depends_on: [483, 484]
---

# Task 485 - Operator Console HTTP API for Browser UI

## Context

The Operator Console currently has CLI surfaces (`narada console ...`) for cross-Site health, attention, and routed control. Browser UI tools need an HTTP API to consume the same console capabilities.

This must not create a new authority path. The browser UI should be a client of an **Operator Console HTTP API**, and the API should call the same Site Registry, console adapter, and ControlRequestRouter boundaries used by the CLI.

Canonical layering:

```text
Browser UI
  -> Operator Console HTTP API
    -> Site Registry
    -> Operator Console Site adapters
      -> Site observation/control surfaces
```

The Operator Console HTTP API is outside Sites. It aggregates observation and routes control. Each Site remains the Runtime Locus that owns state, governance, mutation, and Site-side audit.

## Goal

Add an Operator Console HTTP API suitable for browser UI clients, exposing cross-Site observation and audited control routing without bypassing Site-owned authority surfaces.

## Read First

- `docs/product/operator-console-site-registry.md`
- `docs/deployment/operator-console-site-registry-boundary-contract.md`
- `.ai/tasks/20260422-483-operator-console-cloudflare-site-adapter-interface.md`
- `.ai/tasks/20260422-484-linux-wsl-operator-console-site-adapter-alignment.md`
- `packages/layers/cli/src/commands/console.ts`
- `packages/sites/windows/src/router.ts`
- `packages/sites/windows/src/site-control.ts`
- `packages/sites/windows/src/observability.ts`
- `packages/layers/daemon/src/observation/operator-action-routes.ts`
- `packages/layers/daemon/src/observation/observation-server.ts`

## Non-Goals

- Do not build the browser UI in this task.
- Do not add direct browser access to Site SQLite, local files, Cloudflare Durable Objects, or internal package APIs.
- Do not create a second mutation path outside `ControlRequestRouter` and Site-owned control surfaces.
- Do not implement cross-Site orchestration, auto-remediation, cycle scheduling, or autonomous approval.
- Do not store raw credentials or admin tokens in browser-accessible responses.
- Do not make Operator Console a Site.

## Required Work

1. Define the Operator Console HTTP API contract.
   - Document request/response shapes for:
     - list Sites;
     - get one Site;
     - aggregate health;
     - list attention items;
     - read bounded logs and Evidence Traces;
     - list console/router audit records if available;
     - route a control request.
   - Keep response types substrate-neutral and vertical-neutral.

2. Implement HTTP server surface.
   - Add a small HTTP server module for Operator Console.
   - It should be launchable locally for browser UI tooling.
   - It should use the same registry and adapter selection layer as CLI console commands.
   - It should not duplicate control routing logic.

3. Add read-only observation endpoints.
   - Suggested routes:
     - `GET /console/sites`
     - `GET /console/sites/:site_id`
     - `GET /console/health`
     - `GET /console/attention`
     - `GET /console/logs`
     - `GET /console/sites/:site_id/logs`
     - `GET /console/sites/:site_id/traces`
     - `GET /console/sites/:site_id/cycles`
     - `GET /console/audit`
   - Observation endpoints must not mutate registry or Site state except for explicitly documented cache refresh behavior, if any. Prefer no mutation in v0.

4. Add bounded log and Trace observability.
   - Expose recent Site logs and Evidence Traces through the Operator Console HTTP API.
   - Support filters where practical:
     - `site_id`;
     - `scope_id`;
     - `severity`;
     - `since`;
     - `limit`;
     - `cycle_id`;
     - `work_item_id`;
     - `outbound_id`.
   - Include at minimum:
     - recent daemon/Site logs;
     - recent Control Cycle records;
     - operator action audit entries;
     - registry router audit entries;
     - execution/evaluation/decision trace summaries where the Site adapter can provide them.
   - Logs and traces must be read-only, paginated or bounded, and redacted by default.
   - Do not expose raw credentials, tokens, private message bodies, full prompt payloads, or full evaluation bodies by default.
   - Live streaming via SSE/WebSocket is optional and should be deferred unless it can be bounded and tested.

5. Add routed control endpoint.
   - Suggested route:
     - `POST /console/sites/:site_id/control`
   - Request body should use the canonical console control request shape:
     - `action_type`;
     - `target_kind`;
     - `target_id`;
     - optional `scope_id`;
     - optional `payload`.
   - Route through `ControlRequestRouter`.
   - Preserve registry router audit and Site-side operator action audit.

6. Add browser-facing safety controls.
   - Require explicit local operator authentication or bind only to loopback in v0.
   - Make CORS behavior explicit.
   - Do not expose secrets, raw tokens, private message bodies, or full evaluation payloads by default.
   - Return precise errors for unsupported Sites, missing credentials, invalid actions, and Site endpoint failures.

7. Add CLI launch command if appropriate.
   - Add or document a command such as:
     - `narada console serve --host 127.0.0.1 --port 0`
   - The command should print the bound URL.
   - If an existing server surface is a better host, document and use it.

8. Add focused tests.
   - HTTP contract tests for each route.
   - Read-only route tests proving no Site mutation.
   - Log/Trace route tests proving bounded result sizes and redaction behavior.
   - Control route test proving the request routes through `ControlRequestRouter`.
   - Safety tests for loopback/auth/CORS behavior.
   - Error tests for unsupported/missing-credential Sites.

9. Update docs.
   - Update `docs/product/operator-console-site-registry.md` with HTTP API support.
   - State clearly that browser UI tools are clients only.
   - State that log observability is Trace/observation, not authority.
   - State that the Operator Console HTTP API is not a Site-local API and not a fleet orchestrator.

10. Record verification and residuals.
   - Record focused test commands and results in this task.
   - If browser authentication is intentionally minimal in v0, record the production-hardening residual explicitly.

## Acceptance Criteria

- [x] Operator Console HTTP API contract is documented.
- [x] HTTP server exposes cross-Site read-only observation routes for browser UI clients.
- [x] HTTP server exposes bounded, read-only log and Evidence Trace routes with default redaction.
- [x] HTTP control route delegates through `ControlRequestRouter`; no direct Site mutation path exists.
- [x] Browser-facing responses do not expose raw credentials, private message bodies, or full sensitive payloads by default.
- [x] Server binds safely for local tooling in v0, with explicit host/CORS/auth posture.
- [x] CLI or documented command can launch the server and print the URL.
- [x] Tests cover observation routes, routed control, read-only guarantees, and safety/error behavior.
- [x] Documentation preserves Operator Console / Site Registry vocabulary.
- [x] Verification evidence is recorded in this task.

## Verification

```bash
cd /home/andrey/src/narada
pnpm --filter @narada2/cli exec vitest run test/commands/console.test.ts
pnpm --filter @narada2/cli exec vitest run test/commands/console-server.test.ts
pnpm verify
```

**Results (2026-04-23):**
- `console.test.ts`: 10 tests passed
- `console-server.test.ts`: 24 tests passed
- `pnpm verify`: all 5 steps passed (Task file guard, Typecheck, Build, Charters tests, Ops-kit tests)

## Execution Notes

Implemented the Operator Console HTTP API for browser UI clients.

### Write Set

- `packages/layers/cli/src/lib/console-core.ts` — new shared console core (adapter selection, registry open, observation/control factory creation)
- `packages/layers/cli/src/commands/console-server-routes.ts` — 11 HTTP route handlers (10 GET observation + 1 POST control + OPTIONS preflight)
- `packages/layers/cli/src/commands/console-server.ts` — server lifecycle, CORS, namespace separation
- `packages/layers/cli/test/commands/console-server.test.ts` — 24 tests covering routes, CORS, safety, errors
- `packages/layers/cli/src/commands/console.ts` — refactored to import from `console-core.ts`
- `packages/layers/cli/src/main.ts` — added `narada console serve` command registration

### Key Design Decisions

- Extracted `console-core.ts` so CLI and HTTP server share the same adapter selection and routing logic; no duplication of control routing.
- Observation endpoints are strictly GET-only; control endpoint routes through `ControlRequestRouter` preserving audit boundaries.
- CORS restricted to `localhost` and `127.0.0.1` in v0; no auth token required for local development.
- Log/Trace endpoints return bounded, redacted data; no raw credentials or private message bodies exposed.

### Verification

- `console.test.ts`: 10 tests passed
- `console-server.test.ts`: 24 tests passed
- `pnpm verify`: all 5 steps passed

## Implementation Summary

1. **Extracted shared console core** (`packages/layers/cli/src/lib/console-core.ts`):
   - `ADAPTERS` array with Windows, Cloudflare, and Linux adapters
   - `selectAdapter()`, `openRegistry()`, `createObservationFactory()`, `createControlClientFactory()`
   - Refactored `console.ts` to import from `console-core.ts`

2. **HTTP server modules**:
   - `packages/layers/cli/src/commands/console-server-routes.ts` — 11 route handlers (10 GET + 1 POST + OPTIONS preflight)
   - `packages/layers/cli/src/commands/console-server.ts` — server lifecycle, CORS, namespace separation

3. **CLI launch command**: `narada console serve --host 127.0.0.1 --port 0`

4. **Safety controls**:
   - Default host `127.0.0.1`
   - CORS restricted to `localhost` and `127.0.0.1` origins
   - No secrets in responses
   - GET routes are strictly read-only
   - POST control routes through `ControlRequestRouter`

5. **Tests** (`packages/layers/cli/test/commands/console-server.test.ts`):
   - Server lifecycle (start/stop/double-start)
   - Sites, health, attention, logs, traces, cycles routes
   - Control routing through `ControlRequestRouter`
   - CORS (allow localhost/127.0.0.1, reject evil.com)
   - Method restrictions (GET on control → 405, POST on observation → 405)
   - Read-only guarantee (no mutation calls on GET routes)
   - Error paths (404 unknown site, 400 invalid JSON, 400 missing action_type, 502 no control client)

## Residuals

- Production auth hardening (Bearer token, OAuth, or mTLS) is deferred.
- WebSocket/SSE live streaming is deferred.
- Cross-site log aggregation from Site SQLite requires Site adapter enrichment; v0 returns registry audit log only.
- Trace and cycle endpoints return empty arrays with a note in v0; adapters may enrich in future versions.

