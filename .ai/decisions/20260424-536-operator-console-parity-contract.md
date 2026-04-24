# Decision 536 — Operator Console Parity Contract

> **Status:** Closed  
> **Task:** 536  
> **Governed by:** task_close:a2  
> **Depends on:** 384 (Operator Console HTTP API), 431 (Cloudflare Site Boundary), 437 (Linux Site Boundary)

---

## Goal

Define the precise cross-substrate parity target for the existing Operator Console layer and state what "fully meaningful" means per substrate.

---

## Canonical Console Capability Set

The Operator Console exposes **seven capability families**. These are the surfaces an operator needs to observe and control a Narada Site effectively.

| # | Capability | Observation / Control | Description |
|---|-----------|----------------------|-------------|
| 1 | **Health** | Observation | Site health status, last cycle time, consecutive failures, sync freshness |
| 2 | **Attention Queue** | Observation | Stuck work items, pending outbound commands, pending drafts, credential requirements — aggregated into a single attention-sorted list |
| 3 | **Pending Outbound** | Observation | Outbound commands awaiting approval, draft creation, or send completion |
| 4 | **Pending Drafts** | Observation | Draft-ready outbound items waiting for operator review |
| 5 | **Credential Requirements** | Observation | Auth tokens, certificates, or other credentials the Site needs to function |
| 6 | **Control Actions** | Control | Approve, reject, retry, cancel, mark-reviewed, handled-externally |
| 7 | **Browser Console Support** | Infrastructure | HTTP server serves observation JSON + operator UI, CORS, localhost binding |

---

## Current Substrate Assessment

### Windows (`@narada2/windows-site`)

| Capability | Status | Implementation |
|-----------|--------|----------------|
| Health | ✅ Full | Reads `site_health` table from local SQLite `coordinator.db` |
| Attention Queue | ✅ Full | `deriveAttentionQueue()` aggregates all observation surfaces; stuck items from `work_items`, pending from `outbound_handoffs` |
| Pending Outbound | ✅ Full | Queries `outbound_handoffs` for `pending`, `draft_creating`, `sending` |
| Pending Drafts | ✅ Full | Queries `outbound_handoffs` for `draft_ready` |
| Credential Requirements | ✅ Full | Returns auth requirement when `status = 'auth_failed'` |
| Control Actions | ✅ Full | `WindowsSiteControlClient` maps actions to `executeOperatorAction()` on local SQLite |
| Browser Console | ✅ Full | `console-server.ts` + `console-server-routes.ts` fully operational |

**Windows is the reference substrate.** All capabilities are implemented and tested.

### Cloudflare (`@narada2/cloudflare-site`)

| Capability | Status | Implementation |
|-----------|--------|----------------|
| Health | ✅ Full | Remote `GET /status` on Worker; maps to `SiteHealthRecord` |
| Attention Queue | ⚠️ Partial | `deriveAttentionQueue()` runs but Cloudflare stubs return `[]` for stuck items, pending outbounds, pending drafts. Only credential requirements contribute to attention. |
| Pending Outbound | ❌ Stubbed | Returns `[]`. Worker does not expose `GET /pending-outbounds`. |
| Pending Drafts | ❌ Stubbed | Returns `[]`. Worker does not expose `GET /pending-drafts`. |
| Credential Requirements | ✅ Full | Derived from `getHealth()` — auth requirement when `status = 'auth_failed'` |
| Control Actions | ✅ Full | `CloudflareSiteControlClient` routes via `POST /control/actions` on Worker with Bearer token |
| Browser Console | ✅ Full | HTTP console server routes to Cloudflare adapter generically |

**Cloudflare gap:** The Worker needs to expose three observation endpoints so the adapter can fetch real data instead of returning empty arrays.

### Linux (`@narada2/linux-site`)

| Capability | Status | Implementation |
|-----------|--------|----------------|
| Health | ✅ Full | Reads `site_health` table from local SQLite `coordinator.db` |
| Attention Queue | ⚠️ Partial | `deriveAttentionQueue()` runs but Linux stubs return `[]` for stuck items, pending outbounds, pending drafts. Only credential requirements contribute to attention. |
| Pending Outbound | ❌ Stubbed | Returns `[]`. Linux Sites do not have `outbound_handoffs` table in v0. |
| Pending Drafts | ❌ Stubbed | Returns `[]`. Linux Sites do not have `outbound_handoffs` table in v0. |
| Credential Requirements | ✅ Full | Derived from `getHealth()` — auth requirement when `status = 'auth_failed'` |
| Control Actions | ❌ Not implemented | `LinuxSiteControlClient` returns error: "Linux Site control is not yet implemented in v0" |
| Browser Console | ✅ Partial | HTTP console server routes to Linux adapter generically; observation works, control fails |

**Linux gap:** Two categories:
1. **Observation:** Needs `work_items` and `outbound_handoffs` tables (or proxy to control-plane schema) to replace stubs.
2. **Control:** Needs `executeOperatorAction` wiring for the bounded control path.

---

## Minimum Parity Target for v0

### Cloudflare Minimum Target (Task 537)

To reach "meaningful console parity" for Cloudflare, the following must be implemented:

| Priority | Capability | Required Work |
|----------|-----------|---------------|
| P1 | Pending Outbound | Worker exposes `GET /pending-outbounds`; adapter fetches and maps to `PendingOutboundCommand[]` |
| P1 | Pending Drafts | Worker exposes `GET /pending-drafts`; adapter fetches and maps to `PendingDraft[]` |
| P2 | Stuck Work Items | Worker exposes `GET /stuck-work-items`; adapter fetches and maps to `StuckWorkItem[]` |

**Acceptable v0 deviation:** Cycle records and traces may remain stubbed. The console already returns empty arrays with a v0 note for these.

### Linux Minimum Target (Tasks 538–539)

To reach "meaningful console parity" for Linux, the following must be implemented:

| Priority | Capability | Required Work |
|----------|-----------|---------------|
| P1 | Control Actions | Implement `LinuxSiteControlClient` by routing to local `executeOperatorAction()` on the Site's SQLite DB (same pattern as Windows) |
| P2 | Pending Outbound | Add `outbound_handoffs` query to `LinuxSiteObservationApi` (table may already exist in control-plane schema) |
| P2 | Pending Drafts | Add `outbound_handoffs` query for `draft_ready` status |
| P3 | Stuck Work Items | Add `work_items` query for `failed_retryable` and stale leases |

**Acceptable v0 deviation:** Linux system-mode sites where the current user lacks permissions may continue to return `UnauthorizedLinuxSiteControlClient`. This is a security boundary, not a parity gap.

---

## Acceptable Residual Deviations After the Chapter

The following deviations are explicitly acceptable and do not block chapter closure:

| # | Deviation | Rationale |
|---|-----------|-----------|
| 1 | **macOS has no console adapter** | macOS Site is out of v0 scope. It is not wired into `console-core.ts`. |
| 2 | **Cycle records are stubbed on all substrates** | Cycle observability is adapter-dependent. The console returns `[]` with a v0 note. No substrate implements cycle records yet. |
| 3 | **Trace records are stubbed on all substrates** | Trace observability is adapter-dependent. The console returns `[]` with a v0 note. Only Windows-native has a theoretical path. |
| 4 | **Cloudflare stuck-work-items is P2** | Pending outbound and drafts are higher priority because they block operator action. Stuck items are important but less common. |
| 5 | Linux work_items table may not exist | If the control-plane schema does not include `work_items` for Linux Sites, stuck-work-items can remain stubbed until the schema is extended. |
| 6 | **WSL bridge required for native→WSL control** | Cross-Windows-variant control is explicitly out of scope. The `WslBridgeRequiredControlClient` returns a clear error. |

---

## Capability Matrix

| Capability | Windows | Cloudflare Target | Linux Target |
|-----------|---------|-------------------|--------------|
| Health | ✅ | ✅ | ✅ |
| Attention Queue | ✅ | ⚠️ (after P1) | ⚠️ (after P1) |
| Pending Outbound | ✅ | ✅ (P1) | ✅ (P2) |
| Pending Drafts | ✅ | ✅ (P1) | ✅ (P2) |
| Credential Requirements | ✅ | ✅ | ✅ |
| Control Actions | ✅ | ✅ | ✅ (P1) |
| Browser Console | ✅ | ✅ | ✅ |

**Legend:** ✅ = implemented / target is full parity. ⚠️ = partial — depends on lower-priority items.

---

## Invariants

1. **Console routes remain substrate-agnostic.** `console-server-routes.ts` must not contain substrate-specific logic. All substrate variance is encapsulated in the adapter layer.
2. **Windows remains the reference.** New substrate implementations should match Windows behavior where the schema supports it.
3. **Control actions are canonical.** All substrates must map console actions to the same `OperatorActionPayload` types. No substrate may invent new action semantics.
4. **Stubs must be honest.** A stub that returns `[]` must include a comment explaining why and what would replace it. No silent degradation.
5. **No macOS console adapter in v0.** macOS is explicitly excluded from this chapter.

---

## Verification Evidence

- `console-server.test.ts`: 60+ end-to-end tests covering all substrates via mocked adapters ✅
- `cloudflare-site/test/unit/console-adapter.test.ts`: confirms stubs and health behavior ✅
- `linux-site/test/console-adapter.test.ts`: confirms stubs, health, and control unsupported ✅
- `windows-site/test/unit/observability.test.ts`: confirms full observation surface ✅
- `pnpm typecheck`: all 11 packages pass ✅

---

## Next Executable Lines

1. **Task 537 — Cloudflare Observation Parity:** Add Worker endpoints for pending outbounds, pending drafts, and stuck work items. Update `CloudflareSiteObservationApi` to fetch real data.

2. **Task 538 — Linux Observation Parity:** Add `outbound_handoffs` and `work_items` queries to `LinuxSiteObservationApi`. Verify tables exist in Linux Site schema.

3. **Task 539 — Linux Operator Control Path:** Implement `LinuxSiteControlClient` by wiring to local `executeOperatorAction()` on the Site's SQLite DB, following the Windows pattern.

These three tasks can proceed in parallel after this contract.

---

**Closed by:** a2  
**Closed at:** 2026-04-24
