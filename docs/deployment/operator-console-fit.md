# Operator Console Fit for Email-Marketing Operation

> Defines how the operator console (Tasks 378–384) surfaces email-marketing Operation state without becoming vertical-specific.
>
> This specification is the output of **Task 392**. It governs console behavior for Tasks 391–393. No console changes for the email-marketing Operation may proceed before this specification is referenced.
>
> Uses crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.

---

## 1. Design Principle: Vertical Neutrality

The operator console is **substrate-neutral and vertical-neutral by design**. It observes Sites through generic interfaces and does not contain vertical-specific UI code.

The email-marketing Operation introduces new artifacts (`campaign_brief`) and new attention scenarios (missing sender info, missing Klaviyo credentials). These must surface through the **existing generic observation interfaces** without adding campaign-specific labels, columns, or branching logic to the console.

| Rule | Rationale |
|------|-----------|
| No "campaign" labels in console UI | Vertical neutrality: the console displays `action_type`, not semantic labels |
| No campaign-specific table columns | Generic `outbound_command` and `work_item` schemas are sufficient |
| No vertical-specific SQL in console | Console queries generic tables; vertical-specific views are Site-local |
| No campaign-specific CLI subcommands | Existing `narada ops`, `narada status --site`, `narada console attention` suffice |

---

## 2. Campaign Artifact → Console Surface Mapping

| Artifact | Console Surface | How It Surfaces |
|----------|----------------|-----------------|
| `campaign_brief` outbound | Drafts pending review | `outbound_handoffs` row with `action_type = 'campaign_brief'`, status `draft_ready` |
| `send_reply` follow-up | Drafts pending review | Same as helpdesk — `outbound_handoffs` row with `action_type = 'send_reply'` |
| Missing sender info | Attention queue | `work_item` stuck in `opened` with `context_id` linked to ≥3 `send_reply` outbounds |
| Missing Klaviyo credentials | Attention queue + health | `site_health.status = 'auth_failed'` (v1) or `credential_required` attention item |
| Stuck campaign work item | Attention queue | Same as helpdesk — `work_item` stuck in `leased`/`executing`/`failed_retryable` |

### 2.1 `campaign_brief` as Generic Outbound Command

A `campaign_brief` is stored in the same `outbound_handoffs` / `outbound_versions` tables as helpdesk outbounds. The console observes it through the existing `SiteObservationApi.getPendingOutboundCommands()` and `getPendingDrafts()` methods.

**Generic observation query** (console does not know about campaigns):

```sql
SELECT oh.outbound_id, oh.action_type, oh.status, oh.context_id, oh.created_at, ov.payload_json
FROM outbound_handoffs oh
JOIN outbound_versions ov ON oh.outbound_id = ov.outbound_id AND oh.latest_version = ov.version
WHERE oh.scope_id = ? AND oh.status IN ('draft_ready', 'approved_for_send', 'blocked_policy')
ORDER BY oh.created_at DESC
```

The console displays:
- `action_type`: `"campaign_brief"` (raw string, no translation)
- `status`: `"draft_ready"`
- `payload_json` summary: parsed to show `name`, `audience`, `timing` fields
- `created_at`: when the brief was drafted

**Operator drill-down:** `narada show-draft <outbound-id>` displays the full `payload_json` regardless of action type. No campaign-specific code path needed.

### 2.2 Available Actions for `campaign_brief`

In `ops.ts` `DraftPendingReview.available_actions`, `campaign_brief` gets the same actions as other non-send document types:

```typescript
if (r.status === 'draft_ready') {
  actions.push('mark-reviewed', 'reject-draft', 'handled-externally');
  // campaign_brief does NOT get 'approve-draft-for-send' because it is non-executable in v0
}
```

This requires a **one-line change** in `ops.ts`: exclude `campaign_brief` from the `approve-draft-for-send` branch. The logic remains generic — it checks `action_type`, not vertical.

---

## 3. Missing-Info Attention Derivation

### 3.1 Scenario

A campaign request arrives with missing critical fields (e.g., no audience specified). The charter sends follow-up emails (`send_reply`), but the sender never responds. After 3 follow-ups, the work item should surface in the attention queue.

### 3.2 Derivation Query

The attention queue derives missing-info items from a **generic join** between `work_items` and `outbound_handoffs`:

```sql
SELECT
  wi.work_item_id,
  wi.context_id,
  wi.status,
  wi.created_at,
  COUNT(oh.outbound_id) AS follow_up_count
FROM work_items wi
LEFT JOIN outbound_handoffs oh
  ON oh.context_id = wi.context_id
  AND oh.scope_id = wi.scope_id
  AND oh.action_type = 'send_reply'
  AND oh.status = 'confirmed'
WHERE wi.scope_id = ?
  AND wi.status = 'opened'
  AND wi.created_at < datetime('now', '-24 hours')
GROUP BY wi.work_item_id
HAVING follow_up_count >= 3
ORDER BY wi.created_at ASC
```

### 3.3 Attention Item Shape

```typescript
{
  site_id: "marketing-site",
  scope_id: "marketing-site",
  item_type: "stuck_work_item",        // generic type, not campaign-specific
  item_id: wi.work_item_id,
  severity: "medium",
  summary: `Work item opened ${age} with ${follow_up_count} follow-up emails sent`,
  url_or_command: `narada status --site marketing-site`,
  occurred_at: wi.created_at
}
```

**Key design choice:** The attention item type remains `stuck_work_item`. The summary text mentions follow-ups, but the item type is generic. This avoids adding a new `AttentionItemType` for campaign missing-info.

### 3.4 Alternative: Generic `follow_up_exhausted` Subtype

If the operator needs to distinguish missing-info scenarios from other stuck work, a **generic subtype** field can be added to `StuckWorkItem`:

```typescript
interface StuckWorkItem {
  work_item_id: string;
  scope_id: string;
  status: "failed_retryable" | "leased" | "executing";
  context_id: string;
  last_updated_at: string;
  summary: string;
  subtype?: string;  // NEW: generic classification, not vertical-specific
}
```

The `subtype` is populated by the Site observation query:
- `"follow_up_exhausted"` — when follow-up count ≥ 3
- `"lease_stale"` — when leased > 2 hours
- `"execution_stale"` — when executing > 30 minutes

The console displays `subtype` in the summary but does not branch on it.

---

## 4. Credential-Missing Attention Derivation

### 4.1 Scenario

In v1, the email-marketing Operation requires Klaviyo API credentials. If credentials are missing, the Site health transitions to `auth_failed` and the attention queue surfaces a `credential_required` item.

### 4.2 Health Transition

The Windows Site runner (Task 391) checks credential availability at cycle start:

```typescript
if (operationRequiresKlaviyo && !klaviyoCredentialsResolved) {
  healthTransition = { status: "auth_failed", message: "Klaviyo API key not configured" };
}
```

This follows the same pattern as Graph API auth failures in the helpdesk Operation.

### 4.3 Attention Item

The existing `CrossSiteNotificationRouter` and `deriveAttentionQueue` already handle `auth_failed`:

```typescript
if (health.status === "auth_failed") {
  items.push({
    site_id: site.siteId,
    scope_id: site.siteId,
    item_type: "auth_failed_health",   // existing type
    item_id: `health:${site.siteId}`,
    severity: "high",
    summary: `Site ${site.siteId} auth failed: ${health.message}`,
    url_or_command: `narada status --site ${site.siteId}`,
    occurred_at: health.updated_at,
  });
}
```

**No console changes needed.** The existing `auth_failed` path handles Klaviyo credential failures generically.

### 4.4 Credential Requirement Subtype

For more specific remediation, the `SiteObservationApi.getCredentialRequirements()` method returns:

```typescript
{
  requirement_id: "klaviyo-api-key",
  scope_id: "marketing-site",
  subtype: "token_refresh",           // or "interactive_auth_required"
  summary: "Klaviyo API key not found",
  remediation_command: "narada doctor --site marketing-site",
  remediation_description: "Check Klaviyo credential binding in site config",
  requested_at: "2026-04-22T10:00:00Z"
}
```

This is surfaced as `credential_required` attention item with `subtype: "token_refresh"`. The console already supports this pattern.

---

## 5. CLI Command Coverage

### 5.1 `narada ops`

**Current behavior:** Discovers Windows Sites and shows health, attention queue, drafts pending review.

**For marketing Site:** Works without changes. The `ops` command:
1. Discovers the marketing Site via `discoverWindowsSites()` or registry
2. Queries its coordinator DB for health, work items, outbounds
3. Displays `campaign_brief` drafts alongside `send_reply` drafts

**One required change:** In `ops.ts` `DraftPendingReview.available_actions`, `campaign_brief` must not offer `approve-draft-for-send` (it is non-executable in v0).

### 5.2 `narada status --site <site-id>`

**Current behavior:** Returns Windows Site health + last trace.

**For marketing Site:** Works without changes. Returns:
```json
{
  "site": { "id": "marketing", "variant": "native", "rootDir": "..." },
  "health": "healthy",
  "lastCycleAt": "2026-04-22T14:30:00Z",
  "consecutiveFailures": 0,
  "message": "Cycle completed successfully"
}
```

### 5.3 `narada doctor --site <site-id>`

**Current behavior:** Checks directory existence, DB existence, lock staleness, health status, cycle freshness.

**For marketing Site:** Works without changes. All checks are Site-generic:
- Site directory exists
- Coordinator DB readable
- Lock not stale
- Health not critical/auth_failed
- Cycle within threshold

### 5.4 `narada console attention`

**Current behavior:** Derives attention queue across all registered Sites.

**For marketing Site:** Works without changes. Surfaces:
- `critical_health` / `auth_failed_health` if Site is unhealthy
- `stuck_work_item` if work items are stuck (including missing-info cases)
- `pending_outbound_command` for pending `campaign_brief` or `send_reply`
- `pending_draft` for drafts awaiting approval
- `credential_required` if Klaviyo credentials missing (v1)

### 5.5 `narada console approve/reject/retry`

**Current behavior:** Routes control requests through `ControlRequestRouter`.

**For marketing Site:** Works without changes once `WindowsSiteControlClient` is bound (deferred to post-Task 392). The router forwards to the Site's control API, which handles action execution.

### 5.6 `narada show-draft <outbound-id>`

**Current behavior:** Displays outbound command details including payload.

**For marketing Site:** Works without changes. Displays `campaign_brief` payload JSON:
```json
{
  "name": "April Newsletter",
  "audience": "Active Customers",
  "content_summary": "Monthly product updates",
  "timing": "2026-04-25T09:00:00Z",
  "approval_needed": true
}
```

---

## 6. Required Changes

### 6.1 Changes Needed (Minimal)

| File | Change | Rationale |
|------|--------|-----------|
| `packages/layers/cli/src/commands/ops.ts` | Exclude `campaign_brief` from `approve-draft-for-send` action | `campaign_brief` is non-executable in v0 |
| `packages/layers/control-plane/src/outbound/types.ts` | Add `campaign_brief` to `OutboundActionType` | New action type for outbound handoff |
| `packages/domains/charters/src/runtime/envelope.ts` | Add `campaign_brief` to `AllowedActionSchema` | Charter may propose this action |
| `packages/layers/control-plane/src/foreman/governance.ts` | Add `campaign_brief` payload validator | Validate brief payload structure |

### 6.2 No Changes Needed

| Surface | Reason |
|---------|--------|
| `SiteObservationApi` interface | Already generic enough |
| `deriveAttentionQueue()` | Already handles generic stuck work, auth failed, pending outbounds |
| `CrossSiteNotificationRouter` | Already handles `auth_failed` |
| `consoleStatusCommand()` | Already generic |
| `consoleAttentionCommand()` | Already generic |
| `statusWindowsSite()` | Already generic |
| `doctorWindowsSite()` | Already generic |

---

## 7. Verification Checklist

For Task 393 (Integration Proof), verify:

- [ ] `narada ops` shows a marketing Site with health and cycles
- [ ] `narada ops` displays a `campaign_brief` draft with `action_type: "campaign_brief"`
- [ ] `narada ops` does not offer `approve-draft-for-send` for `campaign_brief`
- [ ] `narada status --site marketing` returns health and last cycle
- [ ] `narada doctor --site marketing` passes all generic checks
- [ ] `narada console attention` includes marketing Site items alongside helpdesk
- [ ] Missing-info stuck work surfaces as `stuck_work_item` with follow-up count in summary
- [ ] Missing Klaviyo credentials (v1) surface as `auth_failed_health` / `credential_required`
- [ ] No campaign-specific strings appear in console code or output (except raw `action_type` values)

---

## 8. Mapping to AGENTS.md Invariants

| Invariant | Preservation |
|-----------|--------------|
| 19. Observation is read-only projection | Console never mutates Site state; all mutation routes through `/control/` |
| 22. Observation API uses view types | `SiteObservationApi` exposes only read methods |
| 24. No mailbox leakage into generic observation | `campaign_brief` uses generic `outbound_handoffs`; no mail-specific columns |
| 27. UI shell stays vertical-neutral | No "Campaign" nav label; briefs appear under generic "Drafts" |
| 28. Neutral tables are kernel substrate | Attention queries target `work_items` + `outbound_handoffs`, not mailbox views |

---

## 9. Closure Checklist

- [x] Campaign artifacts mapped to console surfaces without vertical-specific UI code.
- [x] Generic observation design documented (`outbound_handoffs` query, no campaign-specific columns).
- [x] Missing-info attention derivation documented (generic join, `stuck_work_item` type).
- [x] Credential-missing attention derivation documented (existing `auth_failed` path).
- [x] CLI command coverage verified/documented for `ops`, `status --site`, `doctor --site`, `console attention`.
- [x] Required changes list is minimal (4 files).
- [x] No-Changes-Needed list is explicit.
- [x] Mapping to AGENTS.md invariants is documented.
