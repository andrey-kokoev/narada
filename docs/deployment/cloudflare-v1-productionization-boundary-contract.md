# Cloudflare v1 Productionization Boundary Contract

> Defines what Cloudflare Site v1 productionization means, what it does not mean, and which boundaries downstream tasks (366–370) must preserve when moving from mocked bounded proof to production-shaped mechanics.
>
> Uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.
>
> This contract governs Tasks 365–370. No productionization work may be implemented before this contract is referenced.

---

## 1. Productionization Meaning

**Production-shaped** means the Cloudflare Site has the structural seams, cycle integration, and substrate boundaries needed for a production deployment, but it does **not** mean the Site is production-ready, autonomous, or fully hardened.

The distinction:

| Production-shaped | Production-ready |
|-------------------|------------------|
| Effect worker participates in the Cycle | All error paths are handled without operator intervention |
| Graph credential seam exists and is bindable | Real credentials are rotated and egress-policy validated |
| Retry limits are enforced | Rate-limit behavior is tuned for production load |
| Worker→DO RPC boundary is proven | DO RPC is load-tested under real traffic |
| Cron entry point exists and is testable | Cron schedule is tuned and monitored |

**This chapter targets production-shaped mechanics, not production readiness.**

---

## 2. v1 Scope

### In Scope (Tasks 365–370)

| # | Task | Scope |
|---|------|-------|
| 365 | Boundary contract | This document |
| 366 | Wire effect worker into Cycle | `createEffectExecuteStepHandler` is a first-class step-6 handler; reconcile moves to step 7; fixture reconcile is submitted-only |
| 367 | Real Graph credential/client binding | Graph token provider interface + env binding + mockable seam; no live sends in tests |
| 368 | Retry limit and backoff enforcement | Per-command max retry count, exponential backoff, auto-promotion to `failed_terminal` |
| 369 | Production substrate boundaries | Worker→DO RPC via `fetch()` fixture; Cron-triggered cycle entry fixture |
| 370 | Chapter closure | Review, residuals, CCC posture, next-work recommendations |

### Out of Scope

- **Autonomous send without approval** — `approved_for_send` remains the only execution gate.
- **Generic Site abstraction** — All types and handlers remain Cloudflare-specific.
- **Live manual trial** — No task in this chapter exercises real Graph API calls unless explicitly residualized.
- **Multi-provider execution substrate** — Only `send_reply` via Graph is in scope.
- **Confirmation from API success** — `submitted` ≠ `confirmed`; reconciliation remains separate.
- **Production deployment claim** — Deployment, credential rotation, egress policy, and operational monitoring remain deferred.

---

## 3. No-Overclaim Constraints

Downstream tasks must preserve the following constraints. No implementation task (366–369) may violate them.

### 3.1 No Autonomous Send

An effect may execute only after explicit operator approval transitions an outbound command to `approved_for_send`. No cycle step, worker, or adapter may execute a command in `pending`, `draft_ready`, or any other status.

### 3.2 No API-Success-as-Confirmation

A successful Graph API response (201 draft created, 202 send accepted) may only transition an outbound to `submitted`. Only the reconciliation adapter may transition to `confirmed`, and only against external observation.

### 3.3 No Production-Readiness Claim

Tests, comments, docs, and UI labels must use bounded language:

| Instead of… | Use… |
|-------------|------|
| "production ready" | "production-shaped mechanics" |
| "real email send" | "Graph credential seam is bound" or "mocked Graph client" |
| "automatic cycle execution" | "Cron entry point is wired" |
| "full Graph parity" | "bounded `send_reply` via draft/send" |

### 3.4 No Generic Site Abstraction

All types, handlers, and schemas remain Cloudflare-specific. No `AbstractSite`, `GenericRuntime`, or `MultiProviderAdapter` may be introduced in this chapter.

---

## 4. Cycle Integration Boundaries

### 4.1 Effect Worker as Cycle Participant

Task 366 must wire `executeApprovedCommands` into the Cloudflare Cycle without collapsing the worker's standalone identity.

**Required shape:**

Add a dedicated effect-execution cycle step, e.g. `createExecuteApprovedCommandsStepHandler(adapter)`, that wraps `executeApprovedCommands` in the `CycleStepHandler` contract.

Do not invoke effect execution from `createHandoffStepHandler` or `createLiveReconcileStepHandler`. Handoff creates outbound commands. Reconciliation observes submitted effects. Neither owns external mutation.

**Requirement:** The chosen approach must:
- Preserve the worker's approved-only gate.
- Preserve the worker's action-type gate (`send_reply` only).
- Preserve the worker's lease-based concurrency.
- Preserve the worker's health gate (`auth_failed` blocks).
- Return a `CycleStepResult` with `recordsWritten`, `residuals`, and timing.

### 4.2 Step Ordering

The canonical step order with effect execution:

```
Step 2: sync (fact admission)
Step 3: derive_work (context/work creation)
Step 4: evaluate (charter execution)
Step 5: handoff (decision + outbound creation)
Step 6: execute_approved (effect worker — NEW)
Step 7: reconcile (observation → confirmation)
```

**Rationale:** Execution must happen after handoff creates outbounds and before reconciliation confirms them. This preserves the invariant that reconciliation only observes `submitted` outbounds.

### 4.3 Idempotency

The effect worker step must be safe to re-run. If a command was already `submitted` or `failed_terminal`, the worker must skip it (via lease check or status check). If a command is `failed_retryable`, the worker may re-attempt it.

---

## 5. Credential/Client Binding Seam

### 5.1 Required Env Bindings

A production-shaped Site requires one of the following credential sets:

| Binding | Purpose | Required? |
|---------|---------|-----------|
| `GRAPH_ACCESS_TOKEN` | Static bearer token for Microsoft Graph | Yes (if not using OAuth) |
| `GRAPH_TENANT_ID` | Microsoft identity tenant ID | Yes (for OAuth flow) |
| `GRAPH_CLIENT_ID` | App registration client ID | Yes (for OAuth flow) |
| `GRAPH_CLIENT_SECRET` | App registration client secret | Yes (for OAuth flow) |

Precedence:
1. `GRAPH_ACCESS_TOKEN` → `StaticBearerTokenProvider`
2. `GRAPH_TENANT_ID` + `GRAPH_CLIENT_ID` + `GRAPH_CLIENT_SECRET` → `ClientCredentialsTokenProvider`
3. Missing any required field → `GraphCredentialError` (fail closed before mutation)

### 5.2 Graph Token Provider

```typescript
interface GraphTokenProvider {
  getToken(scopeId: string): Promise<string>;
}
```

Implementations:
- `StaticBearerTokenProvider` — returns the bound token verbatim.
- `ClientCredentialsTokenProvider` — fetches from `login.microsoftonline.com`, caches with 60-second expiry skew, exposes `invalidate()` for 401 recovery.

These are `fetch()`-native, self-contained implementations in the cloudflare package. They do not depend on control-plane Node.js-specific auth code.

### 5.3 Fetch-Based Draft Client

`FetchGraphDraftClient` implements `GraphDraftClient` using native `fetch()` with real Microsoft Graph semantics:
- `createDraftReply` — POST `/users/{scopeId}/messages/{parentMessageId}/createReply`
- `sendDraft` — POST `/users/{scopeId}/messages/{draftId}/send`
- Injects `x-narada-outbound-id` header for downstream reconciliation correlation
- Uses `AbortSignal.timeout(ms)` for per-request timeouts
- Throws errors shaped as `{ status?, code?, message? }` for `GraphDraftSendAdapter.classifyError()`

**Real Graph behavior:** The send endpoint returns `202 Accepted` with an empty body. `sentMessageId` is not available from this response; callers should use `draftId` as the external reference fallback. The adapter handles this gracefully.

### 5.4 Factory

```typescript
function createGraphDraftClient(
  env: CloudflareEnv,
  options?: { baseUrl?: string; timeoutMs?: number },
): GraphDraftClient;
```

The factory resolves credentials from `env`, validates completeness, and returns a `FetchGraphDraftClient`. If credentials are missing, it throws `GraphCredentialError` with `status: 401` so the effect worker classifies it as `failed_terminal`.

### 5.5 Local / Mock Testing Posture

For local testing and automated verification:
- Bind a mock `GraphDraftClient` directly (no factory, no credentials needed).
- The factory and `FetchGraphDraftClient` are only needed for production-shaped deployments.
- All automated tests mock `global.fetch`; no live Graph API calls are exercised.
- No test sends real email.

---

## 6. Retry Limit and Backoff Enforcement

### 6.1 Per-Command Retry Limit

Task 368 must enforce:

- **Max 5** `execution_attempt` rows with `status = "failed_retryable"` for a single `outbound_id`.
- After the 5th `failed_retryable`, the command is auto-promoted to `failed_terminal`.
- Operator override: an explicit audited retry override must either create a new retry generation/version or record an explicit reset marker that downstream retry counting honors. A bare status transition back to `approved_for_send` is not sufficient to reset history-derived attempt counts.

### 6.2 Backoff Behavior

The existing exponential backoff in `GraphDraftSendAdapter` (2s, 4s, 8s, max 60s) is per-attempt retry. Task 368 must ensure:

- Per-attempt retry: max 3 attempts within one worker invocation for retryable errors.
- Per-command retry: max 5 `failed_retryable` records before auto-promotion.
- No unbounded retry loop.

### 6.3 Lease Safety

A crashed worker leaves an `attempting` lease. The next cycle must:
- Detect expired leases (TTL comparison).
- Treat the command as `approved_for_send` and re-attempt.
- Not double-count the expired attempt against the retry limit.

---

## 7. Production Substrate Boundaries

### 7.1 Worker → DO RPC

**Implemented:** `NaradaSiteCoordinator.fetch()` now handles HTTP routing for three endpoints:

| Route | Method | Action |
|-------|--------|--------|
| `/status` | `GET` | Returns `getHealth()` + `getLastCycleTrace()` JSON |
| `/control/actions` | `POST` | Parses payload, executes `executeSiteOperatorAction`, returns result |
| `/cycle` | `POST` | Parses `{ scope_id }`, invokes `runCycleOnCoordinator(siteId, this, env)` |

**Fixture proof:** `test/integration/do-rpc-handler.test.ts` exercises the DO `fetch()` routing by creating real `Request` objects and calling them via the DO stub (`env.NARADA_SITE_COORDINATOR.get(id).fetch(request)`), asserting JSON responses and state mutations.

**Honest residual:** Full DO RPC with `fetch()` in production may differ from the fixture. The fixture proves the boundary pattern, not production-scale RPC behavior. The DO `fetch()` routing is implemented and tested; production deployment may use it or Cloudflare's newer direct DO RPC. Both paths are valid; the fixture proves `fetch()` RPC works.

### 7.2 Cron-Triggered Cycle Entry

**Implemented:** The Worker default export now includes a `scheduled` handler:

```typescript
async scheduled(event: ScheduledEvent, env: CloudflareEnv, _ctx: ExecutionContext) {
  const siteId = ((env as unknown) as Record<string, unknown>).SITE_ID as string | undefined ?? "default";
  const result = await runCycle(siteId, env);
  console.log(`Scheduled cycle ${result.cycle_id} (${event.cron}): ${result.status}`);
}
```

**Fixture proof:** `test/integration/cron-handler.test.ts` mocks a `ScheduledEvent` and calls `handler.scheduled(event, env, ctx)`, asserting health and trace updates.

**Honest residual:** Real Cron scheduling (interval, jitter, retry) is a Cloudflare dashboard concern. The code treats the cron expression as schedule metadata only. Site identity is resolved from `SITE_ID` with `"default"` fallback. Multi-Site scheduling requires explicit cron-to-Site mapping or separate Worker bindings.

---

## 8. Mocked vs Live Evidence Rules

| Boundary | Test Evidence | Live Evidence |
|----------|--------------|---------------|
| Effect worker step | Mock `EffectExecutionAdapter` | Deferred to operational trial |
| Graph draft/send | Mock `GraphDraftClient` | Deferred to operational trial |
| Graph token provider | Mock `GraphTokenProvider` | Requires real credentials |
| Worker→DO RPC | Fixture with `fetch()` mock | Requires deployed Worker + DO |
| Cron entry | Direct handler invocation | Requires Cron Trigger config |

**Rule:** No test in Tasks 366–369 may require live credentials, live Graph API calls, or deployed Cloudflare infrastructure. All tests must pass in `vitest` with mocked boundaries.

---

## 9. Authority Boundaries Preserved from Prior Chapters

| Boundary | Preserved By |
|----------|-------------|
| Facts are durable boundary | Unchanged — sync step admits facts |
| Context/work is separate from facts | Unchanged — derive_work step creates context/work |
| Evaluation is separate from decision | Unchanged — evaluate step produces evidence |
| Decision is separate from intent/handoff | Unchanged — handoff step creates decisions + outbounds |
| Execution requires prior approval | Enforced by `executeApprovedCommands` approved-only gate |
| Execution success ≠ confirmation | Enforced by worker → `submitted`; reconciliation → `confirmed` |
| Confirmation requires observation | Enforced by `createLiveReconcileStepHandler` |
| Operator mutation is audited | Unchanged — `executeSiteOperatorAction` writes audit first |
| Execution attempt is audited | Unchanged — `execution_attempts` records every attempt |

---

## 10. Cross-References

| Document | Relationship |
|----------|--------------|
| [`SEMANTICS.md §2.14`](../../SEMANTICS.md) | Canonical definitions of Aim, Site, Cycle, Act, Trace |
| [`docs/deployment/cloudflare-live-adapter-boundary-contract.md`](cloudflare-live-adapter-boundary-contract.md) | Adapter taxonomy from Tasks 351–357 |
| [`docs/deployment/cloudflare-effect-execution-authority-contract.md`](cloudflare-effect-execution-authority-contract.md) | Effect execution authority, state machine, and forbidden shortcuts from Tasks 358–364 |
| [`.ai/tasks/20260421-365-370-cloudflare-site-v1-productionization.md`](../../.ai/tasks/20260421-365-370-cloudflare-site-v1-productionization.md) | Chapter DAG and closure criteria |
| [`.ai/decisions/20260421-364-cloudflare-effect-execution-boundary-closure.md`](../../.ai/decisions/20260421-364-cloudflare-effect-execution-boundary-closure.md) | Closure of prior chapter; recommended effect execution as next work |

---

## 11. Task Reference

| Task | Contract Reference |
|------|-------------------|
| 365 | This document |
| 366 | §4 (Cycle integration boundaries), §4.2 (step ordering) |
| 367 | §5 (credential/client binding seam) |
| 368 | §6 (retry limit and backoff enforcement) |
| 369 | §7 (production substrate boundaries) |
| 370 | §3 (no-overclaim constraints), §8 (mocked vs live evidence rules) |
