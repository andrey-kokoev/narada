# Narada Operator Runbook — Live Operation

> This runbook covers daily operation, troubleshooting, and first-time setup for the `help@global-maxima.com` mailbox operation.

---

## Daily Operation

### Morning Check

```bash
systemctl status narada-daemon
narada status -c ./ops/config.json
```

Look for:
- Daemon is `active (running)`
- `health: healthy` — last sync within health threshold (see Task 234)
- `quiescence.is_quiescent: true` — no pending work (or `opened_count` > 0 if new mail arrived)
- No `failed_retryable` or `failed_terminal` work items

### Review Stuck Items

After Task 235, check the stuck-work section:

```bash
narada status -c ./ops/config.json --verbose
```

Look for:
- Work items stuck in `opened` or `leased` beyond expected durations
- Outbound commands stuck in `draft_creating` or `submitted`

### Review Audit Log

After Task 236, inspect operator actions:

```bash
narada audit -c ./ops/config.json
```

Verify:
- All recent operator actions are expected
- No unauthorized `request_redispatch` or `reject_draft` actions

### Review Health

Check the health file or readiness endpoint (after Task 234):

```bash
cat ./ops/.health.json
curl http://localhost:8080/ready
```

Look for:
- `status: healthy`
- `consecutiveErrors` below threshold
- `syncFresh: true`

### Evening Check

Before planned maintenance, confirm quiescence:

```bash
narada status -c ./ops/config.json
```

Ensure no active work items (`leased` or `executing`) before stopping the daemon. This minimizes drain time during the maintenance window.

---

## Restart-on-Failure Policy

The systemd unit (`docs/systemd/narada-daemon.service`) specifies `Restart=on-failure`.

| Condition | Auto-restart? | Notes |
|-----------|---------------|-------|
| Non-zero exit code | Yes | After `RestartSec=5` |
| Uncaught exception | Yes | Process exits non-zero |
| Clean shutdown (`SIGTERM`) | **No** | Operator explicitly stopped the service |
| `kill -9` (`SIGKILL`) | Yes | Exit code non-zero |

Check restart count:
```bash
systemctl status narada-daemon
```

A high restart count indicates a persistent fault (corrupted DB, invalid config, auth failure). Investigate logs rather than letting systemd loop indefinitely.

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

## Rehearsed Failure Scenarios

> **Note**: These are manual rehearsals to be performed after Tasks 234–236 are complete.

Perform these rehearsals in a non-production environment before relying on the system in production.

- [ ] **Kill daemon mid-execution** (`kill -9 <pid>`), restart, verify stale lease recovery.
  - Expected: Work items return to `opened` or `failed_retryable` on restart.
- [ ] **Delete `coordinator.db`**, run `narada recover`, verify state is rebuilt.
  - Expected: `narada status` shows recovered work items and contexts.
- [ ] **Corrupt `cursor.json`** (insert invalid token), restart, verify full sync occurs.
  - Expected: First sync after restart performs a full read.
- [ ] **Stop daemon during active sync**, verify no data loss on restart.
  - Expected: Facts already stored are not re-applied; sync resumes from cursor.
- [ ] **Trigger `request_redispatch` action**, verify audit log records it.
  - Expected: `narada audit` shows the operator action request.

---

## First-Time Setup

### 1. Initialize the Repository

```bash
narada init-repo ./ops
```

### 2. Declare the Operation

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

### 3. Set Credentials

Environment variables (recommended for first run):
```bash
export GRAPH_TENANT_ID="your-tenant-id"
export GRAPH_CLIENT_ID="your-client-id"
export GRAPH_CLIENT_SECRET="your-client-secret"
export GRAPH_ACCESS_TOKEN="your-access-token"
```

Or use secure storage references in `config.json` (see `AGENTS.md` § Secret Resolution).

### 4. Run Preflight

```bash
narada preflight help@global-maxima.com -c ./ops/config.json
```

Verifies Graph API connectivity, credential validity, and charter runtime configuration.

### 5. Scaffold Directories

```bash
npx @narada2/ops-kit setup -c ./ops/config.json
```

### 6. Dry-Run Sync

```bash
narada sync -c ./ops/config.json --dry-run
```

### 7. Initial Sync

```bash
narada sync -c ./ops/config.json
```

### 8. Install Systemd Unit

```bash
sudo useradd -r -s /bin/false narada
sudo mkdir -p /var/lib/narada /run/narada /etc/narada
sudo chown -R narada:narada /var/lib/narada /run/narada

sudo cp /path/to/narada-daemon /usr/bin/narada-daemon
sudo chmod +x /usr/bin/narada-daemon

sudo cp docs/systemd/narada-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
```

### 9. Enable and Start the Daemon

```bash
sudo systemctl enable --now narada-daemon
```

### 10. Verify

```bash
systemctl status narada-daemon
narada status -c ./ops/config.json --verbose
```

Look for:
- Daemon `active (running)`
- Work items opened for new conversations
- Evaluations created after charter runs
- Decisions with `approved_action` or `pending_approval`
- Daemon UI accessible at `http://localhost:8080`

---

## Operator Daily Loop

The minimal operator rhythm is documented in [`docs/operator-loop.md`](operator-loop.md). The core command:

```bash
narada ops
```

This composes health, recent activity, attention queue, and drafts pending review into one view. For the full five-step loop (healthy → happened → attention → drafts → next), see the operator loop document.

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

For the canonical product proof definition, fixture/live separation, and inspection checkpoints, see [`docs/first-operation-proof.md`](first-operation-proof.md).

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
