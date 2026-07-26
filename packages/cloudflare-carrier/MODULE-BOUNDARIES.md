# Cloudflare carrier module boundaries

## Purpose

The Cloudflare carrier is a transport and execution embodiment of Narada's
canonical contracts. Its Worker must compose infrastructure and bounded
contexts; it must not become the authority for every product read model,
provider detail, or browser surface.

## Current-to-target ownership map

| Responsibility | Current compatibility surface | Target owner |
|---|---|---|
| Worker fetch and export wiring | `src/cloudflare-worker.ts` | `src/worker-entry.ts` |
| Durable Object lane, snapshot, and alarms | compatibility export in `src/cloudflare-worker.ts` | `src/cloudflare-carrier-durable-object.ts` |
| HTTP authentication and site admission | callbacks in `src/cloudflare-worker.ts` | `src/cloudflare-http-router.ts`, then focused auth/admission modules |
| Carrier session protocol and state transitions | `src/cloudflare-carrier.ts` | `src/cloudflare-carrier.ts` plus focused protocol/effect modules |
| Raw env translation | scattered `env.*` reads | `src/cloudflare-carrier-config.ts` |
| Operation metadata and dispatch | compatibility conditional chain in `src/cloudflare-worker.ts` | `src/cloudflare-product-operation-registry.ts`, `src/*-operation-handlers.ts`, then `src/operations/*` |
| Site/operation control and read models | `src/cloudflare-worker.ts` | `src/operations/site/*`, `src/operations/operation/*` |
| Continuity and resident dispatch | `src/cloudflare-worker.ts` | `src/operations/continuity/*`, `src/operations/resident-dispatch/*` |
| Task lifecycle | `src/cloudflare-worker.ts` | `src/operations/task-lifecycle/*` |
| Mailbox and Graph | `src/cloudflare-worker.ts` | `src/operations/mailbox/*`, `src/adapters/graph/*` |
| Repository publication and GitHub | `src/cloudflare-worker.ts` | `src/operations/repository-publication/*`, `src/adapters/github/*` |
| Workers AI transport and intelligence gateway | compatibility export in `src/cloudflare-worker.ts` | `src/cloudflare-provider-adapter.ts`, then `src/adapters/workers-ai/*` and `src/adapters/intelligence/*` |
| Tool-effect admission and execution | compatibility implementation in `src/cloudflare-worker.ts` | `src/cloudflare-tool-effect-adapter.ts`, then `src/adapters/tool-effects/*` |
| D1 task-store adapter | compatibility export in `src/cloudflare-worker.ts` | `src/cloudflare-d1-task-store-adapter.ts`, then `src/persistence/*` and `migrations/*` |
| Carrier persistence ownership | scattered `db.prepare` calls | `src/cloudflare-persistence-registry.ts` and named bounded-context repositories |
| Local carrier persistence fixtures | core carrier test SQL interpreter | `src/cloudflare-d1-test-fixtures.ts` plus the D1/SQLite persistence contract tests |
| Operator console | compatibility route in `src/cloudflare-worker.ts` | `src/cloudflare-operator-console.ts` plus `src/cloudflare-operator-console-asset.ts` |
| Operator commands | flat compatibility entrypoints in `scripts/*.ts` | `scripts/commands/*` |
| Product read models | flat compatibility entrypoints in `scripts/*.ts` | `scripts/read-models/*` |
| Live workflows | flat compatibility entrypoints in `scripts/*.ts` | `scripts/workflows/*` |
| Script auth/HTTP and ownership metadata | duplicated script-local setup | `scripts/shared/*` |
| Unit/contract/live test orchestration | one package test command | `scripts/contracts/*` and `src/contracts/*` |

## Import-direction rules

- `worker-entry` may compose the Durable Object, HTTP router, configuration,
  operation registry, adapters, and console asset delivery.
- The carrier protocol and canonical contracts must not import the Worker,
  console, D1 implementation, or raw environment object.
- Operation handlers depend on canonical contracts and named ports/repositories;
  they do not read raw bindings or implement HTTP authentication.
- Product operation support is registered once in
  `cloudflare-product-operation-registry.ts`. Context modules own operation
  names and metadata; the compatibility Worker handler is injected behind that
  registry until the remaining extraction tasks move its implementations.
- Adapters implement named ports and are the only owners of Workers AI, Graph,
  GitHub, KV, Durable Object, or D1 transport details.
- Persistence modules own schema initialization, queries, row normalization, and
  idempotency semantics for their bounded context.
- `cloudflare-persistence-registry.ts` is the ownership map for every carrier
  table. New persistence code selects a named domain repository; cross-domain
  SQL is rejected at that port and composed read models remain explicit
  compatibility work until their repository extraction task lands.
- Carrier tests use the reusable D1 fixture boundary rather than embedding the
  SQL interpreter in the core carrier test module. The fixture is contract-tested
  against the node:sqlite D1 adapter used by local and registry tests.
- Console code depends on the authenticated HTTP API contract and contains no
  server-side secrets or persistence implementation.
- Command and live-workflow scripts depend on public package/client surfaces,
  not on Worker-local implementation details.

## Configuration boundary

`createCloudflareCarrierConfig(env)` is the normalized boundary for binding
posture, capability flags, authority references, publication policy, and secret
references. It intentionally contains no model value. Canonical D1 and
request-scoped admission remain the authority for model and route selection.

The first extraction tasks preserve the current public API and use the
configuration boundary as a compatibility seam. Later tasks may move the
implementation behind the target owners without changing the wire contract.
