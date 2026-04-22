# Windows Site Real-Cycle Wiring — Email Marketing Operation

> Identifies what must exist for a Windows 11 Site to run the email-marketing Operation Cycle end-to-end, and documents the gaps between what exists and what is needed.
>
> Governed by:
> - [`docs/deployment/email-marketing-operation-contract.md`](./email-marketing-operation-contract.md) (Task 387)
> - [`docs/deployment/campaign-request-fact-model.md`](./campaign-request-fact-model.md) (Task 388)
>
> Uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.

---

## 1. Existing Windows Site Capabilities

The Windows Site materialization (Tasks 371–377) provides the following substrate for any Operation running on Windows:

### 1.1 Cycle Runner (`packages/sites/windows/src/runner.ts`)

| Capability | Status | Evidence |
|------------|--------|----------|
| **File lock acquisition** | Implemented | `FileLock.acquire()` with 10s timeout, stale-lock recovery |
| **Stuck-lock recovery** | Implemented | TTL-based steal in `recoverStuckLock()` |
| **Bounded Cycle execution** | Partial | 8-step pipeline with fixture stubs for steps 2–6 |
| **Health transition** | Implemented | `computeHealthTransition()` from `@narada2/control-plane` |
| **Health persistence** | Implemented | SQLite `site_health` table |
| **Trace persistence** | Implemented | SQLite `cycle_traces` table |
| **Cycle ceiling enforcement** | Implemented | 5-minute default ceiling with abort buffer |
| **Lock release** | Implemented | Always runs before exit, even on failure |

**Current Cycle step breakdown (`DefaultWindowsSiteRunner.runCycle`):**

| Step | Action | Current State |
|------|--------|---------------|
| 1 | Acquire file lock | ✅ Live |
| 2 | Source sync (Graph delta) | 🔶 Fixture stub |
| 3 | Derive work (context formation) | 🔶 Fixture stub |
| 4 | Evaluate (charter runtime) | 🔶 Fixture stub |
| 5 | Handoff (decision + outbound) | 🔶 Fixture stub |
| 6 | Effect execution | 🔶 Fixture stub |
| 7 | Health/trace update | ✅ Live |
| 8 | Release lock | ✅ Live |

**Legend:** ✅ Live = real implementation. 🔶 Fixture stub = placeholder loop incrementing step counter.

### 1.2 Source Adapter

| Capability | Status | Evidence |
|------------|--------|----------|
| **Graph delta sync** | Reusable from control-plane | `HttpSourceAdapter` in `@narada2/control-plane` |
| **Config loading** | Implemented | `loadConfig()` from `@narada2/control-plane` |
| **Cursor persistence** | Implemented | `cursor.ts` in `@narada2/control-plane` |
| **Apply-log idempotency** | Implemented | `apply-log.ts` in `@narada2/control-plane` |

### 1.3 Coordinator / Persistence (`packages/sites/windows/src/coordinator.ts`)

| Table | Purpose | Status |
|-------|---------|--------|
| `site_health` | Health state per Site | ✅ Live |
| `cycle_traces` | Cycle execution history | ✅ Live |
| `notification_log` | Per-channel notification cooldown | ✅ Live |

**Note:** The Windows Site coordinator does **not** currently include the kernel control-plane tables (`facts`, `apply_log`, `context_records`, `work_items`, `evaluations`, `decisions`, `outbound_handoffs`, `execution_attempts`). These are expected to be in a separate SQLite database opened by the control-plane's `SqliteCoordinatorStore` and `SqliteOutboundStore`.

### 1.4 Charter Runtime

| Capability | Status | Evidence |
|------------|--------|----------|
| **Fixture/mock evaluator** | Exists in Cloudflare package | `MockCharterRunner` in `packages/sites/cloudflare/test/fixtures/` |
| **Sandbox execution** | Not yet on Windows | Cloudflare uses `SandboxEvaluateStepHandler`; Windows defers |
| **Tool catalog binding** | Not yet on Windows | Cloudflare has tool resolver; Windows defers |

### 1.5 Effect Worker

| Capability | Status | Evidence |
|------------|--------|----------|
| **`send_reply` execution** | Implemented in Cloudflare package | `executeApprovedCommands` + `SendReplyWorker` |
| **Windows effect worker** | Not yet wired | Steps 2–6 are fixture stubs; no real effect execution |
| **Retry limit and backoff** | Implemented in Cloudflare | `effect-worker.ts` with per-command max 5 retries |

### 1.6 Operator Surface (`packages/layers/cli/src/commands/`)

| Command | Status | Evidence |
|---------|--------|----------|
| `narada status --site` | ✅ Live | `status.ts` — queries control-plane snapshot |
| `narada doctor --site` | ✅ Live | `doctor.ts` — checks directory, DB, lock, health |
| `narada ops` | ✅ Live | `ops.ts` — discovers Sites, shows health aggregate |
| `narada cycle --site` | ✅ Live | `cycle.ts` — invokes `DefaultWindowsSiteRunner.runCycle()` |
| `narada show-draft` | ✅ Live | `show-draft.ts` — displays outbound command details |
| `narada approve-draft-for-send` | ✅ Live | `approve-draft-for-send.ts` — operator approval action |
| `narada console` | ✅ Live | `console.ts` — cross-Site attention queue |
| `narada sites` | ✅ Live | `sites.ts` — Site registry operations |

### 1.7 Notification

| Capability | Status | Evidence |
|------------|--------|----------|
| `LogNotificationAdapter` | ✅ Live | `packages/sites/windows/src/notification.ts` |
| `WebhookNotificationAdapter` | ✅ Live | Same file, configurable webhook URL |
| Per-channel cooldown | ✅ Live | SQLite `notification_log` with 15-minute default |

### 1.8 Site Discovery and Registry

| Capability | Status | Evidence |
|------------|--------|----------|
| Filesystem scan (native + WSL) | ✅ Live | `discoverWindowsSites()` in `observability.ts` |
| Site Registry (SQLite) | ✅ Live | `registry.ts` — `site_registry`, `registry_audit_log` |
| Cross-site health aggregation | ✅ Live | `aggregation.ts` |
| Attention queue derivation | ✅ Live | `deriveAttentionQueue()` in `aggregation.ts` |

---

## 2. Gaps for Email-Marketing Operation

### 2.1 Vertical-Local Components (New)

| Gap | Exists? | Needed For | Resolution |
|-----|---------|------------|------------|
| `CampaignRequestContextFormation` | ❌ No | Grouping campaign-request facts by thread | Implement in `@narada2/control-plane/src/foreman/` (Task 388 defines behavior) |
| Campaign-production charter | ❌ No | Producing `campaign_brief` or `send_reply` evaluations | Materialize in ops repo; bind in Site config (Task 389) |
| `campaign_brief` action type | ❌ No | Durable draft campaign intent | Add to outbound action types in `@narada2/control-plane` (Task 390) |
| Campaign sender allowlist config | ❌ No | Filtering `campaign_request_senders` | Add to Site `config.json` schema (Task 388) |
| Campaign segment config | ❌ No | Segment mention extraction | Add to Site `config.json` schema (Task 388) |

### 2.2 Substrate Changes (Existing Code Modifications)

| Gap | Exists? | Needed For | Resolution |
|-----|---------|------------|------------|
| Windows Cycle steps 2–6 (real implementations) | 🔶 Partial | Full pipeline execution | Replace fixture stubs with real step handlers. **Not marketing-specific** — same work needed for helpdesk vertical. |
| Charter runtime on Windows | ❌ No | Step 4 evaluation | Port `SandboxEvaluateStepHandler` or equivalent from Cloudflare package to Windows |
| Effect worker on Windows | ❌ No | Step 6 `send_reply` execution | Port `executeApprovedCommands` + `SendReplyWorker` from Cloudflare to Windows |
| Reconciliation adapter on Windows | ❌ No | Step 6+ confirmation | Port `GraphLiveObservationAdapter` from Cloudflare to Windows |
| `narada show-campaign-brief` | ❌ No | Operator review of campaign drafts | Add CLI command or extend `show-draft` to handle `campaign_brief` action type (Task 392) |

### 2.3 Schema Assessment

| Question | Assessment | Evidence |
|----------|------------|----------|
| Does the Cycle runner need modification? | **No** — same 8-step pipeline. Marketing uses the same steps with different config. | `runner.ts` steps are generic; only step handlers differ. |
| Does the Site schema need new tables? | **No** — reuse `outbound_commands` / `outbound_handoffs` via control-plane coordinator DB. | Windows Site coordinator has `site_health`, `cycle_traces`, `notification_log`. Control-plane tables are in separate DB. |
| Does the CLI need new commands? | **Maybe** — `narada show-draft` may suffice if it handles `campaign_brief` generically. | `show-draft.ts` displays outbound commands by ID; action-type-agnostic display may work. |

---

## 3. Gap Table (Consolidated)

| # | Gap | Exists? | Needed For | Resolution | Owner Task |
|---|-----|---------|------------|------------|------------|
| 1 | `CampaignRequestContextFormation` | ❌ No | Context formation from campaign-request facts | Implement strategy class in control-plane | 388 |
| 2 | Campaign-production charter | ❌ No | Charter evaluation producing briefs | Materialize in ops repo; configure policy binding | 389 |
| 3 | `campaign_brief` action type | ❌ No | Durable draft campaign intent | Add to control-plane outbound types and handoff | 390 |
| 4 | Windows real Cycle steps 2–6 | 🔶 Partial | Full pipeline execution (not marketing-specific) | Replace fixture stubs with real handlers | 393 (integration proof) |
| 5 | Windows charter runtime | ❌ No | Step 4 evaluation | Port sandbox/charter handler from Cloudflare | 393 |
| 6 | Windows effect worker | ❌ No | Step 6 `send_reply` execution | Port `executeApprovedCommands` from Cloudflare | 393 |
| 7 | Windows reconciliation adapter | ❌ No | Confirmation of sent replies | Port `GraphLiveObservationAdapter` from Cloudflare | 393 |
| 8 | `narada show-campaign-brief` or generic draft display | ❌ No | Operator review of campaign drafts | Extend `show-draft` or add new command | 392 |
| 9 | Campaign sender allowlist config | ❌ No | Filtering allowed senders | Extend Site `config.json` with `campaign_request_senders` | 388 |
| 10 | Campaign segment config | ❌ No | Segment mention extraction | Extend Site `config.json` with `campaign_segments` | 388 |
| 11 | Klaviyo credential binding | ❌ No | v1 Klaviyo API access | Add `KLAVIYO_API_KEY` env binding + Windows Credential Manager target | 390 (v1) |
| 12 | Marketing-specific health signals | ❌ No | Operator attention for missing campaign info | Derive from `work_items` + `outbound_commands` join | 392 |

---

## 4. Windows 11-Specific Requirements

### 4.1 Site Root Directory Structure

For a marketing Site named `marketing-prod`, the directory structure is:

```text
%LOCALAPPDATA%\Narada\marketing-prod\
├── config.json              # Site configuration + campaign_request_senders + campaign_segments
├── db\
│   └── coordinator.db       # Windows Site coordinator (health, traces, notifications)
├── state\
│   └── cycle.lock\          # FileLock directory
├── logs\
│   └── cycles\              # Cycle execution logs
├── traces\                  # Large trace artifacts
└── node_modules\            # If self-contained
```

**WSL equivalent:**

```text
/var/lib/narada/marketing-prod/
├── config.json
├── db/coordinator.db
├── state/cycle.lock/
├── logs/cycles/
└── traces/
```

### 4.2 Credential Binding

| Credential | Native Windows | WSL | Required For |
|------------|---------------|-----|--------------|
| Graph API access token | Windows Credential Manager (`Narada/{site_id}/graph_access_token`) or env (`NARADA_{SITE}_GRAPH_ACCESS_TOKEN`) | Env or `.env` file | Mailbox source sync (all verticals) |
| Graph tenant ID | Env (`GRAPH_TENANT_ID`) | Env | Mailbox source sync |
| Graph client ID | Env (`GRAPH_CLIENT_ID`) | Env | Mailbox source sync |
| Graph client secret | Windows Credential Manager or env | Env | Mailbox source sync (client credentials flow) |
| Klaviyo API key | Env (`KLAVIYO_API_KEY`) | Env | v1 Klaviyo campaign creation |
| Klaviyo private API key | Env (`KLAVIYO_PRIVATE_API_KEY`) | Env | v1 Klaviyo read operations |

**Note:** In v0, only Graph API credentials are required. Klaviyo credentials are not needed until v1.

### 4.3 Task Scheduler Configuration (Native Windows)

```xml
<!-- Task Scheduler XML snippet for marketing Site -->
<Task>
  <RegistrationInfo>
    <Description>Narada Email Marketing Operation — marketing-prod</Description>
  </RegistrationInfo>
  <Triggers>
    <TimeTrigger>
      <!-- Run every 5 minutes during business hours -->
      <Repetition>
        <Interval>PT5M</Interval>
        <Duration>P1D</Duration>
      </Repetition>
      <StartBoundary>2026-01-01T08:00:00</StartBoundary>
    </TimeTrigger>
  </Triggers>
  <Settings>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Priority>6</Priority>
  </Settings>
  <Actions>
    <Exec>
      <Command>node</Command>
      <Arguments>cycle --site marketing-prod</Arguments>
    </Exec>
  </Actions>
</Task>
```

**Recommendation:** 5-minute intervals for active Sites. 15-minute intervals for low-volume Sites. Never less than 2 minutes ( Graph delta sync overhead + charter evaluation time).

### 4.4 systemd Timer Configuration (WSL)

```ini
# /etc/systemd/system/narada-marketing-prod.timer
[Unit]
Description=Narada Email Marketing Operation Timer — marketing-prod

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
```

### 4.5 Log Retention for Campaign Audit Trails

| Log Type | Location | Retention | Rationale |
|----------|----------|-----------|-----------|
| Cycle traces | SQLite `cycle_traces` | 90 days | Bounded storage; operator can review recent history |
| Site health | SQLite `site_health` | 1 record (current) | Always overwritten |
| Notification log | SQLite `notification_log` | 1 record per channel | Always overwritten |
| Control-plane facts | `coordinator.db` (control-plane) | Indefinite | Facts are the canonical durable boundary |
| Control-plane outbound commands | `coordinator.db` (control-plane) | Indefinite | Durable intent boundary |
| Execution attempts | `coordinator.db` (control-plane) | Indefinite | Audit trail |
| Large trace artifacts | `%LOCALAPPDATA%\Narada\{site}\traces\` | 30 days | Filesystem cleanup via PowerShell script |

**Recommendation:** Campaign briefs are stored as `outbound_command` rows with `actionType: "campaign_brief"` and `payload_json`. These are durable and retained indefinitely in the control-plane coordinator database. The Windows Site's `cycle_traces` table records that a Cycle ran but does not store the brief content.

---

## 5. Substrate Change Assessment

### 5.1 Cycle Runner

**Verdict: No structural changes needed.**

The `DefaultWindowsSiteRunner` already implements the correct 8-step pipeline. Steps 2–6 are fixture stubs because the Windows Site chapter (Tasks 371–377) focused on substrate boundaries (lock, health, trace, supervisor) rather than vertical logic.

To run the email-marketing Operation, the runner needs:
1. Real `SyncStepHandler` (step 2) — reuse `HttpSourceAdapter` from control-plane.
2. Real `DeriveWorkStepHandler` (step 3) — use `CampaignRequestContextFormation`.
3. Real `EvaluateStepHandler` (step 4) — bind campaign-production charter.
4. Real `HandoffStepHandler` (step 5) — reuse `OutboundHandoff` with `campaign_brief` action type.
5. Real `EffectExecuteStepHandler` (step 6) — reuse `executeApprovedCommands` for `send_reply`.

These are **handler bindings**, not runner structural changes.

### 5.2 Site Schema

**Verdict: No new tables needed.**

The Windows Site coordinator schema (`site_health`, `cycle_traces`, `notification_log`) is substrate-only. The control-plane coordinator database (opened by `SqliteCoordinatorStore`) contains all kernel tables (`facts`, `context_records`, `work_items`, `evaluations`, `decisions`, `outbound_handoffs`, `execution_attempts`).

The email-marketing Operation reuses these tables with different data:
- `facts`: `mail.message.discovered` + `campaign.request.discovered`
- `context_records`: campaign-request threads
- `work_items`: campaign work items with `policy_binding: "campaign-production"`
- `outbound_handoffs`: `campaign_brief` and `send_reply` commands

### 5.3 CLI

**Verdict: Minimal changes — possibly none.**

Existing CLI commands are largely action-type-agnostic:

| Command | Marketing Suitability | Change Needed |
|---------|----------------------|---------------|
| `narada status --site marketing` | ✅ Works | None — shows health + trace generically |
| `narada doctor --site marketing` | ✅ Works | None — checks directory, DB, lock generically |
| `narada ops` | ✅ Works | None — discovers all Sites, shows aggregate health |
| `narada cycle --site marketing` | ✅ Works | None — invokes runner with Site config |
| `narada show-draft <id>` | ⚠️ Marginal | May need to pretty-print `campaign_brief` payload JSON |
| `narada approve-draft-for-send <id>` | ✅ Works for `send_reply` | None — action-type-agnostic approval |
| `narada console attention` | ⚠️ Marginal | May need to derive `missing_campaign_info` attention items |

**Potential new command:** `narada show-campaign-brief <id>` — a specialized view of `campaign_brief` outbound commands that renders the structured brief fields (name, audience, content_summary, timing) in human-readable form. This is a **convenience**, not a requirement — `show-draft` with JSON output suffices for v0.

---

## 6. Wiring Checklist

To run the email-marketing Operation on Windows 11, the following must be wired:

### 6.1 Configuration

- [ ] Site `config.json` includes `campaign_request_senders` allowlist.
- [ ] Site `config.json` includes `campaign_segments` list.
- [ ] Site `config.json` includes `campaign_extraction` settings (confidence threshold, max body length).
- [ ] Site `config.json` includes `policy_binding` for campaign-production charter.
- [ ] Graph API credentials are bound (env or Credential Manager).

### 6.2 Control Plane

- [ ] `CampaignRequestContextFormation` is implemented and registered.
- [ ] `campaign.request.discovered` fact type is recognized by fact store.
- [ ] `campaign_brief` action type is recognized by `OutboundHandoff`.
- [ ] Campaign-production charter is materialized in ops repo and bound in config.

### 6.3 Windows Site Runner

- [ ] Step 2: Real sync handler bound to Graph delta source.
- [ ] Step 3: Real derive-work handler using `CampaignRequestContextFormation`.
- [ ] Step 4: Real evaluate handler using campaign-production charter.
- [ ] Step 5: Real handoff handler creating `campaign_brief` / `send_reply` outbounds.
- [ ] Step 6: Real effect worker executing `send_reply` (reuse from Cloudflare).

### 6.4 Operator Surface

- [ ] `narada show-draft` can display `campaign_brief` payloads meaningfully.
- [ ] `narada console attention` derives marketing attention items.
- [ ] Operator can approve `send_reply` drafts via existing `approve-draft-for-send`.

### 6.5 Windows Substrate

- [ ] Task Scheduler task (native) or systemd timer (WSL) configured for 5-minute intervals.
- [ ] Site root directory created with correct structure.
- [ ] Log retention policy documented and optionally scripted.

---

## 7. Closure Checklist

- [x] Existing Windows Site capabilities are inventoried (§1).
- [x] Gaps for email-marketing Operation are identified (§2, §3 — 12 gaps).
- [x] Substrate changes are assessed: runner (no structural changes), schema (no new tables), CLI (minimal).
- [x] Windows 11-specific requirements are documented: directory structure, credential binding, Task Scheduler, systemd timer, log retention.
- [x] Gap table exists with at least 8 entries (12 entries).
- [x] Document references the operation contract (Task 387) and fact model (Task 388).
- [x] No implementation code is added.
- [x] No derivative task-status files are created.
