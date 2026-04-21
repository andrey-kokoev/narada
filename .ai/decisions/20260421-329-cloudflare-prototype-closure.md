# Cloudflare Site Prototype — Closure Review

> Closure artifact for Tasks 320–329: the first Cloudflare-backed Narada Site prototype.

---

## Executive Summary

The Cloudflare Site Prototype chapter delivered a **v0 bounded-Cycle stack** consisting of:

- One Worker entrypoint with `/cycle` and `/status` routes
- One Durable Object (`NaradaSiteCoordinator`) with SQLite-backed lock, health, trace, and synthetic durable state
- One R2 adapter for Site-scoped Trace artifact storage
- One mock Sandbox runner with timeout and memory guards
- One Site manifest schema (Zod-validated)
- One integration smoke fixture proving the stack end-to-end without live credentials

**What works:** The mechanical shell of a Cloudflare Site — routing, DO schema, lock lifecycle, health/trace read/write, R2 I/O, Bearer auth, and smoke verification.

**What is mocked:** The actual Narada kernel logic (sync, normalization, fact admission, context formation, charter evaluation, foreman governance, outbound handoff, reconciliation). Steps 2–6 of the bounded Cycle are placeholder no-ops.

**Verdict:** The prototype is a **structural proof**, not a functional Narada runtime. It validates that the Cloudflare substrate can host the Narada kernel, but the kernel itself must be ported into the Cycle runner for v1.

---

## Task-by-Task Assessment

### Task 320 — Site Manifest/Config Schema

**Delivered:** `packages/layers/control-plane/src/config/site-manifest.ts`
- TypeScript interfaces: `SiteManifest`, `Aim`, `CloudflareBindings`, `SitePolicy`
- Zod schemas with validation: URL-safe `site_id`, exact `substrate` literal, Cron regex, `AllowedAction` subset enforcement
- Validation functions: `validateSiteManifest`, `validateSiteManifestOrThrow`, `isValidSiteManifest`
- 12 unit tests
- Documentation: `docs/deployment/cloudflare-site-manifest.md`

**Status:** ✅ Complete. Schema is validation-ready and uses correct vocabulary.

**Gaps:** No Wrangler config generation. No live config loading in the Worker yet.

---

### Task 321 — Cloudflare Worker Scaffold

**Delivered:** `packages/sites/cloudflare/` package
- Worker fetch handler (`src/index.ts`) with `/cycle` and `/status` routes
- TypeScript, builds cleanly, package boundary is clean
- Exports `CloudflareEnv`, `SiteCoordinator`, `CycleCoordinator` interfaces

**Status:** ✅ Complete. Routing layer is real and tested.

**Gaps:** No Cron Trigger wiring (Worker is HTTP-only in v0). No webhook callback route.

---

### Task 322 — Durable Object Site Coordinator

**Delivered:** `src/coordinator.ts` — `NaradaSiteCoordinator` class
- SQLite schema: `site_locks`, `site_health`, `cycle_traces`, `context_records`, `work_items`, `evaluations`, `foreman_decisions`, `outbound_commands`
- Lock acquisition with TTL expiry and idempotent re-acquisition
- Health read/write with `pendingWorkItems`, `locked`, `lockedByCycleId`
- Trace read/write (last-cycle)
- Synthetic seed methods for smoke fixture support

**Status:** ✅ Complete for v0 boundary. Schema supports all required tables.

**Gaps:**
- DO communicates via direct method calls in tests, not via `fetch()` RPC (the `fetch()` handler is a stub).
- No real fact storage or apply-log.
- No cursor or delta token persistence.
- No DO hibernation / alarm handling.

---

### Task 323 — R2 Trace/Evidence Storage Adapter

**Delivered:** `src/storage/r2-adapter.ts` — `R2Adapter` class
- `writeObject`, `readObject`, `deleteObject`, `listObjects`
- Site-scoped key prefixing
- 10 unit tests

**Status:** ✅ Complete. Adapter is functional and tested.

**Gaps:** No streaming upload for large artifacts. No multipart support. No encryption at rest.

---

### Task 324 — Secret Binding and Egress Policy

**Delivered:** Design documented in `docs/deployment/cloudflare-site-materialization.md` §7
- Secret naming convention: `NARADA_{site_id}_{secret_name}`
- Required secret schema table
- Egress policy host whitelist
- Rotation strategy (manual, deferred to v1)

**Status:** ✅ Documented. No implementation code added (secrets are Worker-level bindings, not runtime code).

**Gaps:** No automatic secret rotation. No secret validation at Worker startup.

---

### Task 325 — Bounded Cycle Runner Contract

**Delivered:** `src/runner.ts` — `runCycle()`
- 8-step Cycle with lock acquisition and release
- Wall-clock ceiling with abort buffer
- Health and trace persistence
- Returns `CycleResult` with `cycle_id`, `steps_completed`, `status`, `trace_key`
- 4 unit tests + integration coverage in smoke fixture

**Status:** ⚠️ Partial. The runner executes all 8 steps mechanically, but steps 2–6 are **placeholder no-ops** (just pushes step numbers). Real Narada logic is not yet integrated.

**Gaps:**
- No Graph API sync (step 2)
- No fact admission / context formation (step 3)
- No charter evaluation (step 4)
- No foreman governance / outbound handoff (step 5)
- No reconciliation (step 6)
- Cycle runner calls DO methods directly instead of via `fetch()` RPC.

---

### Task 326 — Sandbox/Container Execution Proof Spike

**Delivered:** `src/sandbox/runner.ts` — `runSandbox()`
- Timeout guard via `Promise.race`
- Memory guard (rejects if `memory_peak_mb > max_memory_mb`)
- `cycleSmokePayload` — bounded no-op payload that proves startup, input, output, memory tracking
- 5 unit tests

**Status:** ✅ Complete for proof-of-concept. The Sandbox can run *something* bounded.

**Gaps:**
- Real charter runtime is not portable to the Sandbox yet.
- No tool catalog execution inside the Sandbox.
- No Container image support.

---

### Task 327 — Operator Status Endpoint

**Delivered:** `GET /status` in `src/index.ts`
- Bearer token auth via `NARADA_ADMIN_TOKEN`
- `site_id` query parameter resolution
- Fetches health and last-cycle trace from DO
- Returns canonical JSON: `site_id`, `substrate`, `health`, `last_cycle`
- Maps `critical`/`unknown` → `unhealthy`
- Does not expose `traceKey`, raw errors, or secrets
- 15 unit tests

**Status:** ✅ Complete. Endpoint is functional and privacy-safe.

**Gaps:**
- No operator mutations (approve draft, retry work item) — observation-only in v0.
- No real-time updates or WebSocket.

---

### Task 328 — Local-to-Cloudflare Smoke Fixture

**Delivered:** `test/integration/cloudflare-smoke.test.ts`
- Mock DO (better-sqlite3) + mock R2 (in-memory Map) + mock env
- Seeds synthetic data into all 8 DO tables
- Runs `runCycle` end-to-end
- Writes trace artifact to R2
- Asserts: 8 steps complete, lock acquired/released, health healthy, trace persisted, R2 artifact exists, all durable record counts verified, no secrets exposed
- 3 integration tests

**Status:** ✅ Complete. Fixture runs without live credentials.

**Gaps:**
- Synthetic data is seeded by the test, not produced by real Narada logic.
- Steps 2–6 of the Cycle are still placeholder no-ops.

---

## Gap Table

| Category | Gap | Severity | v1 Decision |
|----------|-----|----------|-------------|
| **Runtime** | Cycle steps 2–6 are placeholder no-ops (no real sync/evaluate/govern/handoff/reconcile) | **High** | Must-have for v1 |
| **Runtime** | DO method calls are direct, not via `fetch()` RPC | **High** | Must-have for v1 |
| **Runtime** | Sandbox cannot run real charter runtime or tool catalog | **High** | Must-have for v1 |
| **Observability** | Operator mutations (approve draft, retry work item) not implemented | **High** | Must-have for v1 |
| **Runtime** | Multi-Site coordination not implemented | Medium | Should-have for v1 |
| **Runtime** | Real-time sync (webhook push) not implemented | Medium | Deferred to v2 |
| **Storage** | D1 not evaluated for read-heavy observation | Medium | Should-have for v1 |
| **Storage** | Encryption at rest not implemented | Low | Deferred to v2 |
| **Storage** | No cursor / delta token persistence in DO | Medium | Must-have for v1 |
| **Storage** | No fact store or apply-log in DO | Medium | Must-have for v1 |
| **Verticals** | Timer, webhook, filesystem peers not ported | Medium | Deferred to v2 |
| **Tooling** | Wrangler deployment automation not built | Medium | Should-have for v1 |
| **Tooling** | Local-to-Cloudflare migration path not defined | Medium | Deferred to v2 |
| **Tooling** | Cron Trigger wiring not implemented | Medium | Should-have for v1 |

---

## v1 Scope Decisions

### Must-Have for v1

1. **Port Narada kernel into Cycle runner** — Replace placeholder steps 2–6 with real sync, normalize, fact admission, context formation, charter evaluation, foreman governance, outbound handoff, and reconciliation logic.
2. **DO RPC via `fetch()`** — Replace direct method calls with proper Durable Object `fetch()` RPC so the Worker → DO boundary matches real Cloudflare behavior.
3. **Real charter runtime in Sandbox** — Port the charter runner and tool catalog into the Sandbox/Container execution environment.
4. **Operator mutations** — Implement `POST` endpoints for approve-draft, reject-draft, retry-work-item via the audited operator action surface.
5. **Cursor and apply-log persistence** — Store sync cursor and apply-log in DO SQLite so Cycles are idempotent and resumable.

### Should-Have for v1

6. **Cron Trigger wiring** — Wire the Worker to a Cron Trigger for scheduled Cycle invocation.
7. **D1 evaluation** — Evaluate D1 for read-heavy observation queries; keep DO SQLite for write-heavy coordination.
8. **Wrangler deployment automation** — Script or GitHub Action for `wrangler deploy` with secret binding.
9. **Multi-Site support** — One Worker can route to multiple DO instances by `site_id`.

### Deferred to v2+

10. **Real-time sync** — Webhook push instead of Cron polling.
11. **Encryption at rest** — R2 object encryption.
12. **Local-to-Cloudflare migration** — Tool to migrate state from local SQLite to Cloudflare DO.
13. **Multi-vertical** — Timer, webhook, filesystem verticals.
14. **Queues / Workflows** — Deferred outbound retry and multi-stage Cycle chaining.
15. **Public dashboard** — Real-time operator UI.

---

## Corrective Notes for Design Doc

`docs/deployment/cloudflare-site-materialization.md` should be updated with:

- The DO schema now includes `evaluations`, `foreman_decisions`, and `outbound_commands` tables.
- The `site_health` table now includes `pending_work_items`, `locked`, and `locked_by_cycle_id` columns.
- The Cycle runner currently uses direct method calls on the DO stub in tests; production will use `fetch()` RPC.
- The Sandbox v0 proof uses a mock payload; real charter runtime portability is v1.
- Secret binding is documented but not yet validated at Worker startup.

---

## Closure Date

2026-04-21

## Overall Verdict

The Cloudflare Site Prototype is a **successful structural proof**. It demonstrates that the Narada kernel can be hosted on Cloudflare's substrate (Worker + DO + R2 + Sandbox) and that the bounded-Cycle model is mechanically sound. The gap between this prototype and a production-ready Cloudflare Site is the **porting of the Narada kernel itself** into the Cycle runner — a substantial but well-scoped v1 effort.
