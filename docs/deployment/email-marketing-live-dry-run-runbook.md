# Email Marketing Live Dry Run — Operator Runbook

> Precise operator steps for executing Task 403 (Controlled Live Input & Dry Run Execution).
>
> **Do not execute this runbook autonomously.** It requires real Graph API credentials, live mailbox access, and human selection of one controlled campaign-request thread.
>
> Governed by:
> - [`docs/deployment/email-marketing-live-dry-run-boundary-contract.md`](./email-marketing-live-dry-run-boundary-contract.md) (Task 399)
> - [`docs/deployment/email-marketing-operation-contract.md`](./email-marketing-operation-contract.md) (Task 387)
> - [`docs/deployment/klaviyo-intent-boundary.md`](./klaviyo-intent-boundary.md) (Task 390)
> - [`docs/deployment/windows-site-real-cycle-wiring.md`](./windows-site-real-cycle-wiring.md) (Task 391)

---

## 1. Prerequisites

### 1.1 Software

| Requirement | Version / Source | Verification |
|-------------|-----------------|--------------|
| Node.js | ≥ 20 | `node --version` |
| pnpm | ≥ 8 | `pnpm --version` |
| Narada monorepo | Latest `main` branch | `git status` shows clean working tree |
| Windows 11 or WSL2 | Native or WSL variant | `narada sites` discovers the target host |

### 1.2 Build

```bash
pnpm install
pnpm build
```

All 9 workspace packages must build without errors.

### 1.3 Credential Sources to Check

Graph API credentials are **required**. Klaviyo credentials are **not required** in v0.

| Credential | Env Var (highest precedence) | Secure Storage Key | Config Key | Required? |
|------------|------------------------------|-------------------|------------|-----------|
| Graph access token | `GRAPH_ACCESS_TOKEN` | `graph_access_token` | `graph.access_token` | ✅ Yes |
| Graph tenant ID | `GRAPH_TENANT_ID` | — | `graph.tenant_id` | ✅ Yes |
| Graph client ID | `GRAPH_CLIENT_ID` | — | `graph.client_id` | ✅ Yes |
| Graph client secret | `GRAPH_CLIENT_SECRET` | `graph_client_secret` | `graph.client_secret` | ✅ Yes (client-credentials flow) |
| Graph user ID | — | — | `graph.user_id` | ✅ Yes (mailbox identity) |
| Charter API key | `NARADA_OPENAI_API_KEY` or `OPENAI_API_KEY` | `charter_api_key` | `charter.api_key` | ✅ Yes (if charter runtime is `codex-api`) |
| Klaviyo API key | `KLAVIYO_API_KEY` | `klaviyo_api_key` | `klaviyo.api_key` | ❌ No — v0 does not resolve Klaviyo credentials |

**Verify credentials are present (do not print values):**

```bash
# Env vars
env | grep -E '^(GRAPH_|NARADA_OPENAI|OPENAI_)' | cut -d= -f1

# Secure storage (Windows Credential Manager)
narada doctor --site <site-id> --verbose
```

### 1.4 Config File Locations

| File | Location | Purpose |
|------|----------|---------|
| Site config | `%LOCALAPPDATA%\Narada\<site-id>\config.json` (native)<br>`/var/lib/narada/<site-id>/config.json` (WSL) | Scope, sources, policy, charter binding, allowed senders |
| Ops repo config | Private ops repo clone (outside public Narada) | Brand voice, segment definitions, campaign templates, proprietary prompts |
| Global config | `./config.json` in public repo (development only) | Multi-scope development config; do not use for live dry run |

### 1.5 Site Config Shape (Minimal Dry-Run Config)

```json
{
  "site_id": "marketing-dry-run",
  "variant": "native",
  "site_root": "%LOCALAPPDATA%\\Narada\\marketing-dry-run",
  "config_path": "%LOCALAPPDATA%\\Narada\\marketing-dry-run\\config.json",
  "cycle_interval_minutes": 5,
  "lock_ttl_ms": 35000,
  "ceiling_ms": 300000,
  "sources": [
    {
      "type": "graph",
      "mailbox": "campaign-requests@example.com",
      "delta_sync": true
    }
  ],
  "graph": {
    "tenant_id": "{ "$secure": "tenant_id" }",
    "client_id": "{ "$secure": "client_id" }",
    "user_id": "campaign-requests@example.com",
    "base_url": "https://graph.microsoft.com/v1.0",
    "prefer_immutable_ids": true
  },
  "scope": {
    "included_container_refs": ["inbox"],
    "included_item_kinds": ["message"]
  },
  "normalize": {
    "attachment_policy": "metadata_only",
    "body_policy": "text_only",
    "include_headers": false,
    "tombstones_enabled": true
  },
  "runtime": {
    "polling_interval_ms": 300000,
    "acquire_lock_timeout_ms": 30000,
    "cleanup_tmp_on_startup": true,
    "rebuild_views_after_sync": false,
    "rebuild_search_after_sync": false
  },
  "charter": {
    "runtime": "codex-api",
    "api_key": "{ "$secure": "charter_api_key" }",
    "model": "gpt-4o-mini",
    "base_url": "https://api.openai.com/v1",
    "timeout_ms": 60000
  },
  "policy": {
    "primary_charter": "campaign_producer",
    "secondary_charters": [],
    "allowed_actions": ["campaign_brief", "send_reply", "no_action"],
    "allowed_tools": [],
    "require_human_approval": true
  },
  "campaign_request_senders": [
    "colleague1@example.com",
    "colleague2@example.com"
  ],
  "campaign_request_lookback_days": 7
}
```

> **Hard rule:** The `allowed_actions` array must contain only `campaign_brief`, `send_reply`, and `no_action`. No `klaviyo_*` actions. No `send_new_message` unless explicitly intended.

---

## 2. Bounded Input Guardrails

Before running the dry run, verify these constraints are in place. If any constraint is violated, **abort** and fix config before proceeding.

| Guardrail | Verification Command / Check |
|-----------|------------------------------|
| **One mailbox only** | `config.json` contains exactly one source with `"type": "graph"`. No IMAP, no webhook, no second mailbox. |
| **One selected thread** | Operator has identified a single `conversation_id` or `subject` prefix to watch. The first matching allowed-sender thread is the target; all others are ignored for this run. |
| **Allowed sender check** | Every sender in `campaign_request_senders` is a known colleague address. No wildcards. No external domains unless explicitly trusted. |
| **No unbounded inbox sweep** | `campaign_request_lookback_days` ≤ 7. Sync cursor is positioned to the target thread's approximate date. |
| **No auto-approval** | `policy.require_human_approval` is `true`. `campaign_brief` is explicitly excluded from `approve-draft-for-send` in code (see §6.3). |
| **No effect execution beyond brief / draft** | `allowed_actions` does not include `klaviyo_campaign_create`, `klaviyo_campaign_send`, or any other Klaviyo action. |
| **No Klaviyo credential binding** | `KLAVIYO_API_KEY` is absent from env. No `klaviyo` section in Site config. |

---

## 3. Command Sequence

### Step 1 — Preflight: Doctor

```bash
narada doctor --site marketing-dry-run --verbose
```

**Expected output:**
- Site directory exists and is writable
- Coordinator DB is readable
- Lock is not stale
- Health is `healthy`, `degraded`, or `unknown` (first run)
- Graph credentials resolve (no `auth_failed`)
- Charter runtime config is valid (if using `codex-api`)

**Abort conditions:**
- `auth_failed` → fix credentials before proceeding
- `critical` health → run `narada status --site marketing-dry-run` to diagnose
- Missing directory → run `narada sites --init marketing-dry-run`

### Step 2 — Select Controlled Thread

1. Open the designated mailbox in Outlook / webmail.
2. Find **one** thread from an allowed sender with a clear campaign request.
3. Record:
   - `conversation_id` (or `subject` prefix as proxy)
   - Sender email
   - Expected extracted fields (name, audience, timing, content)
4. Position the sync cursor to just before this thread's date, or ensure the thread is within the 7-day lookback window.

**Example target thread:**

```
From: colleague1@example.com (on allowlist)
To: campaign-requests@example.com
Subject: Campaign request: Spring Launch

Hi team,

Can we run a campaign for the spring product launch?
Target audience: VIP segment
Timing: Next Tuesday
Content: Use the spring template

Thanks!
```

### Step 3 — Execute One Cycle

```bash
narada cycle --site marketing-dry-run --verbose
```

**What happens:**
1. Acquires file lock
2. Syncs Graph delta (only mail newer than cursor)
3. Admits allowed-sender mail facts
4. Forms campaign-request context(s)
5. Opens work item(s)
6. Evaluates with campaign-production charter
7. Creates foreman decision + outbound command
8. Updates health and trace
9. Releases lock

**Expected duration:** 10–60 seconds depending on mail volume and charter latency.

**Expected result object:**

```json
{
  "cycle_id": "cycle_...",
  "site_id": "marketing-dry-run",
  "status": "complete",
  "steps_completed": [1, 2, 3, 4, 5, 6, 7, 8],
  "error": null
}
```

### Step 4 — Inspect Status

```bash
narada status --site marketing-dry-run
```

**Expected:**
- `health.status` is `healthy` or `degraded`
- `last_cycle_at` is within the last few minutes
- `consecutive_failures` is 0

### Step 5 — Inspect Durable Records

Connect to the Site coordinator database directly:

```bash
# Path depends on variant
sqlite3 "%LOCALAPPDATA%\Narada\marketing-dry-run\db\coordinator.db"
```

Run these verification queries:

```sql
-- 1. Context record exists for the campaign thread
SELECT context_id, scope_id, primary_charter, status
FROM context_records
WHERE primary_charter = 'campaign_producer';
-- Expected: 1 row

-- 2. Work item was opened
SELECT work_item_id, context_id, status
FROM work_items
WHERE status = 'opened';
-- Expected: 1 row

-- 3. Evaluation was produced
SELECT evaluation_id, work_item_id, outcome, summary
FROM evaluations
WHERE charter_id = 'campaign_producer';
-- Expected: outcome = 'complete' or 'clarification_needed'

-- 4. Foreman decision exists
SELECT decision_id, approved_action, outbound_id
FROM foreman_decisions;
-- Expected: approved_action = 'campaign_brief' or 'send_reply'

-- 5. Outbound command exists with payload
SELECT oh.outbound_id, oh.action_type, oh.status, ov.payload_json
FROM outbound_handoffs oh
JOIN outbound_versions ov
  ON oh.outbound_id = ov.outbound_id
  AND oh.latest_version = ov.version
WHERE oh.action_type IN ('campaign_brief', 'send_reply');
-- Expected: action_type = 'campaign_brief' or 'send_reply'
--           status = 'draft_ready'
--           payload_json contains structured brief or reply draft

-- 6. NO Klaviyo actions exist
SELECT COUNT(*) FROM outbound_handoffs
WHERE action_type LIKE 'klaviyo_%';
-- Expected: 0
```

### Step 6 — Inspect Operator Console

```bash
narada ops --site marketing-dry-run
```

**Expected:**
- Site health is `healthy`
- Attention queue is empty or contains only expected items
- Drafts pending review shows the `campaign_brief` or `send_reply` draft
- `available_actions` for `campaign_brief` does **not** include `approve-draft-for-send`

### Step 7 — Inspect Cycle Trace

```bash
narada status --site marketing-dry-run
```

The output includes `lastTrace` when querying a Windows Site.

Or query directly:

```sql
SELECT cycle_id, status, steps_completed, started_at, finished_at
FROM cycle_traces
ORDER BY started_at DESC
LIMIT 1;
```

**Expected:**
- `status` = `complete`
- `steps_completed` contains all 8 steps
- `error` is null

---

## 4. Expected Success Outputs

### 4.1 Campaign Brief Produced

If the input email contains all required fields:

| Record | Expected State |
|--------|---------------|
| `context_records` | `status = 'active'`, `primary_charter = 'campaign_producer'` |
| `work_items` | `status = 'opened'` |
| `evaluations` | `outcome = 'complete'`, `summary` describes the brief |
| `foreman_decisions` | `approved_action = 'campaign_brief'` |
| `outbound_handoffs` | `action_type = 'campaign_brief'`, `status = 'draft_ready'` |
| `outbound_versions` | `payload_json` contains structured brief with `name`, `audience`, `content_summary`, `timing` |

**Example payload_json:**

```json
{
  "name": "Spring Launch",
  "audience": "VIP segment",
  "content_summary": "Product launch announcement using spring template",
  "timing": "2026-04-29T09:00:00Z",
  "approval_needed": true
}
```

### 4.2 Missing-Info Follow-Up Produced

If the input email is missing required fields:

| Record | Expected State |
|--------|---------------|
| `context_records` | `status = 'active'` |
| `work_items` | `status = 'opened'` |
| `evaluations` | `outcome = 'clarification_needed'` |
| `foreman_decisions` | `approved_action = 'send_reply'` |
| `outbound_handoffs` | `action_type = 'send_reply'`, `status = 'draft_ready'` |
| `outbound_versions` | `payload_json` contains reply draft asking for missing info |

**Example payload_json:**

```json
{
  "to": ["colleague1@example.com"],
  "subject": "Re: Campaign request: Spring Launch",
  "body_text": "Which segment or list should receive this campaign? When would you like it sent?"
}
```

### 4.3 No Work Opened (Allowed but Not Campaign)

If the allowed sender sends non-campaign mail, or the thread is outside the lookback window:

| Record | Expected State |
|--------|---------------|
| `context_records` | May exist (mail fact admitted) but no `campaign_producer` charter |
| `work_items` | No campaign work items opened |
| `evaluations` | None |
| `foreman_decisions` | None |
| `outbound_handoffs` | None |

This is **expected behavior**, not a failure. The Cycle should still report `status = 'complete'`.

---

## 5. Expected Safe Failure Outputs

### 5.1 Auth Failure

| Symptom | Cause | Remediation |
|---------|-------|-------------|
| `site_health.status = 'auth_failed'` | Graph token expired or missing | Refresh token; re-run `narada doctor --site` |
| `cycle_traces.status = 'failed'` | Lock acquired but sync threw 401 | Fix credentials; retry |

**No durable records are created** on auth failure. No external mutation occurs.

### 5.2 No Allowed-Sender Mail Found

| Symptom | Cause | Remediation |
|---------|-------|-------------|
| Cycle completes with 0 facts admitted | Cursor ahead of target mail; or mail is old | Reset cursor; or select fresher thread |

**No work opened.** Health remains `healthy`. This is expected.

### 5.3 Charter Produces Forbidden Action

| Symptom | Cause | Remediation |
|---------|-------|-------------|
| `foreman_decisions.approved_action = 'no_op'` | Governance rejected forbidden action type | Review charter capability binding; check `allowed_actions` in config |

The foreman governance layer blocks forbidden actions before they reach `outbound_handoffs`. **No command is created.**

### 5.4 Cycle Partial / Timeout

| Symptom | Cause | Remediation |
|---------|-------|-------------|
| `cycle_traces.status = 'partial'` | Ceiling exceeded during sync or evaluation | Re-run with longer `ceiling_ms`; or reduce mail volume |
| `steps_completed` missing steps > 2 | Deadline exceeded mid-Cycle | Check `ceiling_ms` and `abortBufferMs` in runner config |

Health transitions to `degraded` (1st failure) or `critical` (3rd consecutive). Re-run after fixing the bottleneck.

### 5.5 Missing Info → Stuck Work Item

| Symptom | Cause | Remediation |
|---------|-------|-------------|
| `work_items.status = 'opened'` for > 24h | Sender never replied to follow-up | Operator manually closes via `handled-externally` or reaches out directly |
| Attention queue shows `stuck_work_item` | ≥ 3 `send_reply` outbounds confirmed | Operator inspects thread; decides next action |

---

## 6. No-Klaviyo-Mutation Verification

This is a **mandatory checklist** after every dry run. Every item must pass.

### 6.1 Credential Absence Check

```bash
# Must return nothing
env | grep -i klaviyo

# Must not contain klaviyo section
cat "%LOCALAPPDATA%\Narada\marketing-dry-run\config.json" | grep -i klaviyo
```

### 6.2 Database Check

```sql
-- Must return 0
SELECT COUNT(*) FROM outbound_handoffs WHERE action_type LIKE 'klaviyo_%';

-- Must return 0
SELECT COUNT(*) FROM outbound_transitions WHERE to_status LIKE 'klaviyo_%';
```

### 6.3 Code Invariant Check

`campaign_brief` is document-only in v0. The following code invariants prevent execution:

- `packages/layers/control-plane/src/outbound/types.ts`:
  - `isValidTransition()` blocks `campaign_brief` from transitioning to `approved_for_send`, `sending`, or `submitted`
  - `isEligibleForExecution()` returns `false` for `campaign_brief` because it is not `send_reply`/`send_new_message` and its status is `draft_ready` (non-send actions require `draft_ready`, but `campaign_brief` is explicitly excluded from execution workers)

- `packages/layers/cli/src/commands/drafts.ts` and `ops.ts`:
  - `campaign_brief` does **not** receive `approve-draft-for-send` in `available_actions`

- No `KlaviyoEffectAdapter` implementation exists in the codebase (only interface in `docs/deployment/klaviyo-intent-boundary.md`).

### 6.4 Network Traffic Check (Optional but Recommended)

If running on a monitored network, verify no outbound HTTPS traffic to:
- `*.klaviyo.com`
- `a.klaviyo.com`

The only expected outbound API calls are to:
- `graph.microsoft.com` (delta sync)
- `api.openai.com` (charter evaluation, if using `codex-api`)

---

## 7. Rollback and Cleanup

If the dry run produces unexpected results, use these cleanup actions. **No cleanup may delete facts or mutate the apply-log.**

| Cleanup Action | Command / SQL | Effect |
|---------------|---------------|--------|
| Delete `campaign_brief` outbound | `DELETE FROM outbound_handoffs WHERE outbound_id = '<id>';`<br>`DELETE FROM outbound_versions WHERE outbound_id = '<id>';` | Removes draft from operator view. Facts and context remain. |
| Delete `send_reply` outbound | Same as above | Removes reply draft. Facts remain. |
| Mark work item as handled externally | `UPDATE work_items SET status = 'closed', resolved_revision_id = '<rev>', resolution_outcome = 'handled_externally', updated_at = datetime('now') WHERE work_item_id = '<id>';` | Closes work item without executing. Context remains for audit. |
| Reset sync cursor | `DELETE FROM source_cursors WHERE source_id = '<source-id>';` | Forces re-sync from a known point. Apply-log prevents duplicate fact admission. |
| Delete execution trace | `DELETE FROM cycle_traces WHERE cycle_id = '<id>';` | Removes advisory trace. Does not affect durable state. |
| Delete health record | `DELETE FROM site_health WHERE site_id = '<site-id>';` | Resets health to default. Next cycle re-computes. |

**Hard invariant:** Never run `DELETE FROM facts;` or `DELETE FROM apply_log;`. Facts are append-only.

---

## 8. Closure Checklist

After the dry run, verify:

- [ ] One controlled mailbox thread was selected and documented (conversation_id, sender, expected fields).
- [ ] Real Graph API source was bound and `narada doctor` passed.
- [ ] One Cycle executed successfully against real mail.
- [ ] At least one of the following exists in durable storage:
  - `campaign_brief` outbound command with structured payload, OR
  - `send_reply` outbound command requesting missing info.
- [ ] No Klaviyo API call was made (§6 verification passed).
- [ ] No campaign was sent or published.
- [ ] Cycle health is `healthy` or `degraded` (not `critical`).
- [ ] Execution trace is recorded in `cycle_traces`.
- [ ] No private data (sender addresses, credentials, mail content) was committed to the public Narada repo.

---

## 9. Mapping to Task 403

This runbook is the **prerequisite** for Task 403. Task 403 itself is the live execution record. Before starting Task 403:

1. Verify all prerequisites in §1 are met.
2. Confirm bounded input guardrails in §2 are satisfied.
3. Execute the command sequence in §3.
4. Complete the no-Klaviyo verification in §6.
5. Check off the closure checklist in §8.

If any step fails, document the gap and return to the appropriate preceding task (400–402) before retrying.
