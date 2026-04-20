# Narada Operator Runbook — Live Operation

> This runbook covers daily operation, troubleshooting, and first-time setup for the `help@global-maxima.com` mailbox operation.

---

## Daily Operation

### 1. Check Sync Health

```bash
narada status -c ./ops/config.json
```

Or via the daemon observation API:
```bash
curl http://localhost:8080/scopes/help@global-maxima.com/overview
```

Look for:
- `health: healthy` — last sync within 24 hours
- `quiescence.is_quiescent: true` — no pending work (or `opened_count` > 0 if new mail arrived)
- No `failed_retryable` or `failed_terminal` work items

### 2. Review Active Work Items

```bash
curl http://localhost:8080/scopes/help@global-maxima.com/work-items
```

Or inspect via CLI:
```bash
narada status -c ./ops/config.json --verbose
```

### 3. Inspect Charter Proposals

After a work item is resolved, inspect its evaluation:

```bash
curl http://localhost:8080/scopes/help@global-maxima.com/evaluations/<evaluation-id>
```

Or via CLI (after Task 231):
```bash
narada show evaluation <evaluation-id> -c ./ops/config.json -s help@global-maxima.com
```

This reveals:
- `proposed_actions` — what the charter wanted to do
- `confidence` — how certain the charter was
- `classifications` — how the charter categorized the message
- `escalations` — any escalations flagged

### 4. Inspect Foreman Decisions

```bash
narada show decision <decision-id> -c ./ops/config.json -s help@global-maxima.com
```

Reveals:
- `approved_action` — what the foreman approved
- `rationale` — why the foreman made this decision
- `payload` — the actual draft/content payload

### 5. Inspect Execution Envelopes

```bash
narada show execution <execution-id> -c ./ops/config.json -s help@global-maxima.com
```

Reveals:
- `runtime_envelope` — exactly what context the charter saw
- `outcome` — exactly what the charter produced

---

## When Something Goes Wrong

### Work Item Stuck in `opened`

**Symptoms:** Work item sits in `opened` status, no lease acquired.

**Diagnosis:**
```bash
curl http://localhost:8080/scopes/help@global-maxima.com/leases
```

**Actions:**
1. Check if the scheduler is running (daemon logs)
2. Check `quiescence` indicator for stale leases
3. Trigger redispatch via operator action:
   ```bash
   curl -X POST http://localhost:8080/control/scopes/help@global-maxima.com/actions \
     -H "Content-Type: application/json" \
     -d '{"action_type": "request_redispatch"}'
   ```

### Work Item Stuck in `leased`

**Symptoms:** Work item in `leased` status for a long time.

**Diagnosis:**
```bash
curl http://localhost:8080/scopes/help@global-maxima.com/leases
```

**Actions:**
- The scheduler automatically recovers stale leases after `leaseDurationMs` expires
- If recovery doesn't happen, check daemon logs for scheduler errors
- Manual recovery: restart the daemon or trigger `request_redispatch`

### Charter Produces `no_action` or `escalation`

**Symptoms:** Evaluation shows `outcome: "no_action"` or non-empty `escalations`.

**Diagnosis:**
```bash
narada show evaluation <evaluation-id> -c ./ops/config.json
```

**Actions:**
1. Inspect the `runtime_envelope` to see what context the charter received
2. Check if the message store has the correct message content
3. Review the `reasoning_log` in the execution outcome
4. If context is incomplete, check `MailboxContextMaterializer` and thread view symlinks

### Draft Not Created

**Symptoms:** Work item resolved with `action_created`, but no draft exists.

**Diagnosis:**
```bash
curl http://localhost:8080/scopes/help@global-maxima.com/mail-executions
```

**Actions:**
1. Inspect the foreman decision:
   ```bash
   narada show decision <decision-id> -c ./ops/config.json
   ```
2. Check outbound handoff status:
   ```bash
   curl http://localhost:8080/scopes/help@global-maxima.com/mail-executions
   ```
3. If status is `failed_terminal`, check `terminal_reason`
4. If status is `blocked_policy`, a policy gate blocked the draft (e.g., recipient not in thread participants)

### Draft Created but Wrong Content

**Symptoms:** Draft exists but body doesn't match expectations.

**Diagnosis:**
```bash
narada show decision <decision-id> -c ./ops/config.json
```

**Actions:**
1. Check `payload` in the decision — this is what the charter proposed
2. If the charter proposed correct content but draft is wrong, check send-reply worker logs
3. If the charter proposed wrong content, inspect the `runtime_envelope` to see if context was correct
4. Update the support steward prompt or knowledge sources if needed

### Sync Failing

**Symptoms:** `narada status` shows `health: stale` or `error`.

**Diagnosis:**
```bash
narada status -c ./ops/config.json --verbose
```

**Actions:**
1. Check `cursor.json` in the operation's `state/` directory
2. Verify Graph API credentials:
   - `GRAPH_ACCESS_TOKEN` env var
   - Or `graph.access_token` in config (via secure storage ref)
3. Test connectivity:
   ```bash
   narada sync -c ./ops/config.json --dry-run
   ```
4. If delta token expired, the sync runner will auto-detect and request full sync

---

## First-Time Setup

### 1. Declare the Operation

```bash
npx @narada2/ops-kit want-mailbox help@global-maxima.com \
  --primary-charter support_steward \
  --posture draft-only
```

Or manually edit `config.json`:
```json
{
  "scopes": [{
    "scope_id": "help@global-maxima.com",
    "root_dir": "./mailboxes/help-global-maxima",
    "mailbox_id": "help@global-maxima.com",
    "policy": {
      "primary_charter": "support_steward",
      "allowed_actions": ["draft_reply", "mark_read", "no_action"],
      "require_human_approval": true
    }
  }]
}
```

### 2. Add Graph Credentials

Environment variables (recommended for first run):
```bash
export GRAPH_TENANT_ID="your-tenant-id"
export GRAPH_CLIENT_ID="your-client-id"
export GRAPH_CLIENT_SECRET="your-client-secret"
export GRAPH_ACCESS_TOKEN="your-access-token"
```

### 3. Scaffold Directories

```bash
npx @narada2/ops-kit setup -c ./ops/config.json
```

### 4. Dry-Run Sync

```bash
narada sync -c ./ops/config.json --dry-run
```

### 5. Initial Sync

```bash
narada sync -c ./ops/config.json
```

### 6. Start Daemon for Continuous Operation

```bash
narada daemon -c ./ops/config.json
```

Or run once for testing:
```bash
narada daemon -c ./ops/config.json --once
```

### 7. Verify First Work Item

After the first sync + dispatch cycle:
```bash
narada status -c ./ops/config.json --verbose
```

Look for:
- Work items opened for new conversations
- Evaluations created after charter runs
- Decisions with `approved_action` or `pending_approval`

---

## Smoke Test (Fixture-Based)

Run the fixture-based smoke test to verify the pipeline without live credentials:

```bash
pnpm test:control-plane -- test/integration/live-operation/smoke-test.test.ts
```

This test:
1. Seeds the `support-thread-login-issue` fixture
2. Runs the full pipeline: facts → context → work item → charter → foreman → send-reply worker
3. Verifies the final `draft_reply` state is `confirmed` (draft created, not sent)
4. Verifies a second path with `require_human_approval: true` stops at `pending_approval`

---

## Deferred Capabilities

The following are intentionally NOT covered in the Live Operation chapter:

| Capability | Why Deferred |
|---|---|
| Autonomous send (`require_human_approval: false` as default) | Safety first. Draft-only posture prevents accidental sends. |
| Multi-vertical operations (timer, webhook, filesystem) | Mailbox vertical is the first proven vertical. Others need separate acceptance. |
| Production UI polish (real-time updates, graphs) | Observation API is functional; UI polish is a separate product milestone. |
| Generalized knowledge-base RAG | Knowledge source injection exists; full RAG pipeline needs design. |
| Secondary charter arbitration | Single primary charter is sufficient for support use case. |
| Non-mail outbound actions (tickets, CRM) | Requires new executor families and vertical sources. |
| Cross-context customer grouping | Needs identity resolution layer not yet built. |
