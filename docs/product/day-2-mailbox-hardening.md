# Day-2 Mailbox Hardening Guide

> **Scope**: Operational failure modes, recovery procedures, and hardening gaps for the mailbox vertical.
> **Audience**: Operators running Narada in production against live Exchange/Graph mailboxes.
> **Last updated**: 2026-04-20

---

## 1. Failure Mode Taxonomy

### 1.1 Auth and Credential Failures

| Failure | Detection | Runtime Behavior | Operator Action |
|---------|-----------|------------------|-----------------|
| **Expired token** (natural TTL) | `SharedTokenProvider` invalidates cache 60s before expiry; new token fetched automatically | Sync/send continues transparently | None |
| **Revoked credentials** (app secret rotated, conditional access policy) | Graph returns `401`/`403` on any API call | Token cache is auto-invalidated on first 401/403. Workers transition affected commands to `failed_terminal` with auth-related `terminal_reason`. Sync aborts with `GRAPH_AUTH_FAILED` (non-recoverable). | Fix credentials in config/env, then run `narada retry-auth-failed` to restore terminal commands |
| **Transient token acquisition failure** (OAuth endpoint 500/timeout) | `ClientCredentialsTokenProvider` or `SharedTokenProvider` throws during `fetchToken` | Retry logic (`withRetry`) retries up to 3× with backoff. If still failing, sync aborts with retryable or fatal status depending on final error. | Check `doctor` output; retry sync manually if OAuth endpoint recovers |
| **Empty/missing token** | `StaticBearerTokenProvider` throws "Graph access token is empty" | Sync aborts immediately (fatal) | Verify `GRAPH_ACCESS_TOKEN` env var or secure storage reference |

### 1.2 Degraded-State Behaviors

| Mode | Trigger | Effect on Outbound Pipeline |
|------|---------|----------------------------|
| `degraded_mode: "normal"` (default) | Default config | Full pipeline: draft creation → approval → send → confirmation |
| `degraded_mode: "draft_only"` | Operator sets `charter.degraded_mode: "draft_only"` | Runtime health reports `degraded_draft_only`. `require_human_approval` is forced `true` in runtime policy. Charters may only propose `draft_reply`; `send_reply` and `send_new_message` proposals are gated to draft-only. Operator must explicitly approve each send. |

**Important**: `draft_only` does **not** disable the send execution worker. It prevents charters from proposing sends without approval. If an operator manually approves a draft for send while in `draft_only`, the `SendExecutionWorker` will still execute it.

### 1.3 Graph API Edge Cases

| Edge Case | Current Handling | Gap / Note |
|-----------|-----------------|------------|
| **Draft recreation after remote loss** | `SendExecutionWorker` and `SendReplyWorker` detect missing managed draft, recreate via `createDraft`, and continue | Verified by unit tests |
| **Remote mutation / partial mismatch** | Pre-send verification hashes body, recipients, subject, and `X-Outbound-Id` header. Any mismatch → `failed_terminal` with "External modification detected" | Verified by unit tests |
| **Missing sent confirmation timing** | `OutboundReconciler` scans `submitted` commands. Confirms via `findByOutboundId` (send) or `findByMessageId` (non-send). 5-minute default window; expires to `retry_wait` | `send_new_message` uses same `findByOutboundId` path as `send_reply` |
| **Attachment-bearing replies** | `CreateDraftPayload` does **not** include attachment fields. Attachment data is normalized inbound but not included in outbound draft creation | Known gap: outbound attachments require future design work |
| **Rate limiting (429)** | Classified as `GRAPH_RATE_LIMIT`, retryable with `Retry-After` backoff. Circuit breaker tracks consecutive failures | Verified by unit tests |
| **Graph server errors (5xx)** | Classified as `GRAPH_SERVER_ERROR`, retryable with exponential backoff | Verified by unit tests |
| **Message not found during non-send reconciliation** | Reconciliation leaves command in `submitted` until confirmation window expires, then `retry_wait` | Operator can run `narada confirm-replay` to force reconciliation |

---

## 2. Recovery Drills

### 2.1 Recover After Daemon Interruption

**Scenario**: Daemon crashes or is restarted while work items are `leased` or `executing`.

**Procedure**:
1. Restart daemon.
2. Scheduler lease scanner will detect expired leases (based on `lease_expires_at`) and release them.
3. Execution attempts left in `executing` without an active lease are marked `crashed` by the scheduler.
4. Work items in `failed_retryable` are eligible for automatic retry.
5. If control-plane state is suspect (e.g., coordinator.db corruption), run:
   ```bash
   narada recover --scope <scope-id> --dry-run
   narada recover --scope <scope-id>
   ```
   This rebuilds `context_records`, `work_items`, and `agent_sessions` from the fact store.

**What is NOT recovered automatically**:
- Active leases (must be re-acquired by scheduler)
- In-flight execution attempts (must be restarted by runner)
- Submitted outbound effects (confirmation requires inbound reconciliation)

### 2.2 Recover After Outbound Ambiguity

**Scenario**: A send succeeds at Graph but the local SQLite `submitted` transition fails (crash between send and commit). Command remains in `sending`.

**Procedure**:
1. On next worker poll, the command is still in `sending`.
2. The worker does not re-send (idempotency is at the Graph draft level, not the send level).
3. Run `narada confirm-replay --outbound-ids <id>` to force reconciliation:
   ```bash
   narada confirm-replay --scope <scope-id> --outbound-ids <outbound-id>
   ```
4. The reconciler looks for the message by `X-Outbound-Id` header and transitions to `confirmed` if found.

**Scenario**: A non-send action (move, mark read) succeeds at Graph but local `submitted` transition fails.

**Procedure**:
Same as above — `confirm-replay` will reconcile by `messageId` and observed state.

### 2.3 Recover After Auth Restoration

**Scenario**: Credentials were revoked; multiple commands failed to `failed_terminal` with auth errors. Credentials are now restored.

**Procedure**:
1. Update credentials (env var, secure storage, or config).
2. The next sync or outbound worker call will fetch a fresh token (cache auto-invalidates on 401/403).
3. Retry the affected commands:
   ```bash
   # Retry all auth-failed commands across all scopes
   narada retry-auth-failed

   # Retry a specific command
   narada retry-auth-failed <outbound-id>
   ```
4. Verify recovery:
   ```bash
   narada doctor
   ```
   (The `doctor` command checks all configured operations; there is no `--scope` option.)

**What `retry-auth-failed` does**:
- Scans `failed_terminal` commands where `terminal_reason` contains "auth" (case-insensitive)
- Transitions `send_reply` / `send_new_message` → `approved_for_send`
- Transitions `draft_reply` / `mark_read` / `move_message` / `set_categories` → `draft_ready`
- Clears `terminal_reason` so workers can pick them up
- Appends an audit transition: `failed_terminal → <target>` with reason `operator_retry_after_auth_restored`

---

## 3. Operational Runbook Snippets

### Check for auth-failed terminals
```bash
narada ops --limit 20
# Look for commands with status "failed_terminal" and terminal_reason containing "Auth"
```

### Force a token cache refresh
There is no explicit CLI for this. The cache invalidates automatically on the next 401/403. To force it, restart the daemon or trigger a sync that will fetch a new token if the cached one is stale.

### Put mailbox in draft-only mode
Edit `config.json`:
```json
{
  "charter": {
    "degraded_mode": "draft_only"
  }
}
```
Then restart daemon or trigger a sync via the daemon operator action surface (`trigger_sync`). There is no `narada trigger-sync` CLI command.

### Remove from draft-only mode
Revert `degraded_mode` to `"normal"` and restart.

---

## 4. Hardening Changes Implemented (Task 293)

1. **Auto token cache invalidation on 401/403**: `GraphHttpClient` calls `tokenProvider.invalidateAccessToken()` when receiving auth errors. `SharedTokenProvider` and `ClientCredentialsTokenProvider` both implement cache clearing.
2. **`retry_auth_failed` operator action**: New CLI command (`narada retry-auth-failed`) and operator action surface (available to the daemon UI and any executor caller) to bulk-retry commands that failed due to auth errors after credentials are restored.
3. **State machine relaxation**: `failed_terminal` can now transition to `approved_for_send` and `draft_ready` to support auth recovery. The transition is only exercised through the `retry_auth_failed` operator action path; there is no dedicated API boundary enforcing this, so callers must respect the convention.
4. **Auth error test coverage**: Added unit tests for auth failure during draft recreation, verification, and send in `SendExecutionWorker`.
5. **`getCommandsByScope` store method**: Added to `OutboundStore` interface and `SqliteOutboundStore` to support scope-scanned recovery actions.

---

## 5. Terminal Failure Detection

Terminal failures require operator intervention. For the definitive reference on each failure class — including detection step, operator-visible signal, recovery procedure, and prevention — see [`docs/product/mailbox-terminal-failures.md`](mailbox-terminal-failures.md).

**Quick lookup:**

| Failure Class | Detection | Operator Action |
|---|---|---|
| **Graph API auth expired / revoked** | `401`/`403` on sync or send; `narada ops` shows `failed_terminal` with auth-related `terminal_reason`; `narada doctor` flags auth health | Fix credentials, then run `narada retry-auth-failed` |
| **Charter evaluation repeatedly errors** | Work item in `failed_retryable` or `failed_terminal` with 3+ consecutive execution failures; `narada ops` Attention Queue shows stuck work | Inspect with `narada show execution <id>`; review charter config or knowledge freshness |
| **Outbound send rejected by Graph** | Graph returns `400`/`403` on send; command transitions to `failed_terminal` with Graph error detail | Review draft content and permissions; retry or reject |
| **Sync cursor corrupted / invalid delta token** | Sync aborts with `GRAPH_SYNC_FAILED` or cursor read error; `narada doctor` reports stale sync | Delete cursor file and trigger re-sync |
| **Disk / storage full** | Write failures during persistence (atomic rename fails, SQLite returns `SQLITE_FULL`) | Free disk space; rotate logs or expand storage |
| **External draft mutation detected** | Pre-send verification hash mismatch; command transitions to `failed_terminal` | Inspect draft in Graph/Outlook; re-approve or investigate compromise |
| **Max retries exceeded** | Worker retries a `failed_retryable` command up to the configured limit, then transitions to `failed_terminal` | Inspect daemon logs; fix root cause, then retry manually |

**Where to look first:**
- `narada ops` — one-screen summary of health, recent activity, attention queue, and drafts pending review
- `narada doctor` — automated health probes with remediation strings
- `narada show execution <id>` — deep-dive into a specific execution attempt
- Daemon logs — `tail -n 200 <rootDir>/logs/daemon.log`

---

## 6. Draft/Send Posture

For the full draft/send posture guide — including the "always draft first" principle, high-stakes vs low-stakes routing, batch review patterns, and the `require_human_approval` policy field — see [`docs/product/mailbox-draft-send-posture.md`](mailbox-draft-send-posture.md).

**Quick reference:**

| Posture | `require_human_approval` | Send Actions Allowed | Use Case |
|---------|--------------------------|----------------------|----------|
| **Supervised** (recommended) | `true` | No | Daily customer support; every send requires operator approval |
| **Semi-Autonomous** | `true` | Yes | High-volume, low-risk; charter prepares sends, operator batch-approves |
| **Autonomous** | `false` | Yes | Internal/auto-ack workflows only; not recommended for customer-facing |

**Consistency rule:** `require_human_approval: false` without `send_reply` or `send_new_message` in `allowed_actions` is contradictory — drafts will sit in `draft_ready` indefinitely with no promotion path.

---

## 7. Day-2 Operational Runbook

This runbook is the minimal daily, weekly, and monthly practice for a supervised mailbox operation. It is checklist-oriented: print it, run it, check boxes. For the canonical five-step operator loop, see [`docs/product/operator-loop.md`](operator-loop.md).

---

### Morning Operator Rhythm (~5 minutes)

**Aim:** Confirm the Site is healthy, the Cycle ran overnight, and the review queue is ready for disposition.

```bash
narada ops
```

- [ ] **Health** is `healthy` or `degraded` (not `failing`).
- [ ] **Recent Activity** shows overnight evaluations and decisions (evidence the daemon cycled).
- [ ] **Attention Queue** has no new stuck work items or commands.
- [ ] **Drafts Pending Review** are present in expected volume and content.

**If drafts are pending:**

```bash
# Inspect a draft
narada show-draft <outbound-id>

# Approve for send (only if send action)
narada approve-draft-for-send <outbound-id>

# Reject with rationale
narada reject-draft <outbound-id> --rationale "..."

# Mark reviewed without sending
narada mark-reviewed <outbound-id> --notes "..."
```

**Exit condition:** All drafts are dispositioned or intentionally deferred; health is acceptable.

---

### Afternoon Check (~3 minutes)

**Aim:** Confirm that approved sends reached `confirmed`, no new failures appeared, and the audit log is clean.

```bash
narada ops
narada audit --since 4h
```

- [ ] All morning-approved sends have reached `confirmed` (not stuck in `sending` or `submitted`).
- [ ] No `failed_terminal` work items or outbound commands appeared during the day.
- [ ] Audit log shows only expected operator actions (your approvals / rejections / reviews).
- [ ] No new items in the Attention Queue since morning.

**If sends are stuck in `submitted` beyond the confirmation window:**

```bash
narada confirm-replay --scope <scope-id> --outbound-ids <id>
```

**If stuck items are found:**

```bash
# Deep-dive into a stuck execution
narada show execution <execution-id>

# Inspect a failed command
narada show outbound <outbound-id> --operation <scope-id>
```

**Exit condition:** All outbound effects are either `confirmed` or intentionally held; no unexplained failures.

---

### Weekly Hygiene (~15 minutes)

**Aim:** Prune stale state, verify deep health, and refresh knowledge.

```bash
narada ops --limit 50
narada doctor
```

- [ ] **Review terminal failures:** Inspect any `failed_terminal` commands from the past week. Root-cause and retry or reject.
- [ ] **Archive old traces:** Old `agent_traces` and execution attempts are non-authoritative but consume storage. There is no automatic pruning; rotate or archive manually if storage is tight.
- [ ] **Review knowledge accumulation:** Open `knowledge/` in your ops repo.
  - [ ] Move stale playbooks to `knowledge/archive/`.
  - [ ] Add new playbooks for recurring issues observed this week.
  - [ ] Verify escalation criteria still match current procedures.
- [ ] **Verify sync cursor health:** Check `.health.json` — `lastSyncAt` should be within the last few hours.
- [ ] **Run `narada doctor`:** All probes should pass or warn with actionable remediation.

**Exit condition:** No unexplained terminal failures; knowledge is fresh; storage and health are acceptable.

---

### Monthly Audit (~30 minutes)

**Aim:** Detect drift, verify auth, and audit charter behavior over a longer horizon.

```bash
narada audit --since 30d
narada doctor
```

- [ ] **Review operator action audit log:**
  - [ ] Look for unexpected actions (manual transitions you did not perform).
  - [ ] Look for unusual rejection patterns (charter consistently proposing bad drafts).
  - [ ] Verify every `retry-auth-failed` was followed by a confirmed recovery.
- [ ] **Verify auth tokens:**
  - [ ] Graph API credentials are valid (`narada doctor` probes this).
  - [ ] Charter runtime API key is valid and endpoint is responsive.
  - [ ] Secure storage references resolve (if used).
- [ ] **Check for charter behavior drift:**
  - [ ] Compare recent evaluations against historical norms for the same context types.
  - [ ] Check if confidence scores or action distributions have shifted.
  - [ ] Review any `failed_retryable` work items that required manual retry.
- [ ] **Check for config drift:** Compare live `config.json` against your ops-repo backup.
  - [ ] `require_human_approval` matches intended posture.
  - [ ] `allowed_actions` matches intended posture.
  - [ ] `primary_charter` and `secondary_charters` are unchanged (unless changed intentionally).
- [ ] **Verify backup integrity** (if backups are configured):
  ```bash
  narada backup-verify
  ```

**Exit condition:** Auth is valid; config matches intent; no behavioral drift; audit log is clean.

---

### Emergency Procedures

| Scenario | Immediate Action | Follow-Up |
|---|---|---|
| **Auth expiry / revoked credentials** | `narada doctor` → identify 401/403 → fix credentials (env / secure storage / config) → `narada retry-auth-failed` | Verify all scopes recover; check audit log for missed sends; re-run `narada doctor` |
| **Stuck cycle / daemon not cycling** | `narada doctor` → check daemon PID → restart if necessary → verify `lastSyncAt` updates | Inspect logs for crash loops or charter runtime errors; run `narada recover --scope <scope-id> --dry-run` if control-plane state is suspect |
| **Corrupted sync cursor** | Delete `<rootDir>/.cursor/<scope-id>.json` → trigger sync → verify delta token re-establishes | Monitor for duplicate events (apply-log prevents application, but cursor must re-establish); check `.health.json` |
| **Suspected data loss / coordinator corruption** | `narada recover --scope <scope-id> --dry-run` → review output → run `narada recover --scope <scope-id>` | Verify work items and contexts are reconstructed; re-review any drafts that reappear; run `narada doctor` |
| **Disk / storage full** | Free disk space immediately (rotate logs, archive old traces, expand volume) | Identify largest consumers (`du -sh <rootDir>/logs`, `<rootDir>/.traces`); set up log rotation if not present |
| **External draft mutation alert** | `narada show outbound <id>` → inspect Graph draft → if compromised, revoke credentials and investigate | Review account access logs; consider `degraded_mode: "draft_only"` until root cause is found |

**First-response checklist for any emergency:**

1. [ ] Run `narada doctor` for automated diagnosis and remediation strings.
2. [ ] Run `narada ops` for a one-screen snapshot of health, queue, and drafts.
3. [ ] Check daemon logs: `tail -n 200 <rootDir>/logs/daemon.log`.
4. [ ] Do **not** run `narada recover` without `--dry-run` first.
5. [ ] Do **not** delete the fact store or apply-log.
6. [ ] Document the incident in operator notes for the monthly audit.

---

## 8. Review Queue UX

### Local Daemon (CLI)

The review queue is surfaced through the `narada ops` command and the operator action surface. See [`docs/product/operator-loop.md`](operator-loop.md) for the canonical five-step loop:

1. **Is it healthy?** → `narada ops`, `narada doctor`
2. **What happened?** → `narada ops` (Recent Activity), `narada show evaluation <id>`
3. **What needs attention?** → `narada ops` (Attention Queue)
4. **What drafts exist?** → `narada ops` (Drafts Pending Review), `narada show-draft <id>`
5. **What do I do next?** → `narada ops` (Suggested Next Actions)

Every draft shows:
- Context ID (conversation/thread)
- Charter rationale (evaluation output)
- Draft payload (subject, body preview, recipients)
- Available actions: `mark-reviewed`, `approve-draft-for-send`, `reject-draft`, `handled-externally`

Every operator action is recorded as an audit transition with timestamp and operator identity.

### Cloudflare (Design for v1)

The Cloudflare Site v0 scaffold does not yet include an outbound worker or draft review surface. The v1 design will expose:

- `GET /status` — already implemented; returns cycle health and last trace
- `GET /drafts` — list `draft_ready` outbound commands for the site
- `GET /drafts/:outbound_id` — inspect draft payload, evaluation, and decision
- `POST /control/scopes/:scope_id/actions` — approve, reject, or mark-reviewed (reuses the existing operator action framework)

Until v1, Cloudflare-hosted sites are limited to autonomous or semi-autonomous postures where `require_human_approval: false` or approval is handled out-of-band.

---

## 9. Related Documents

- [`docs/product/operator-loop.md`](operator-loop.md) — Canonical five-step operator live loop
- [`docs/concepts/mailbox-knowledge-model.md`](../concepts/mailbox-knowledge-model.md) — Knowledge placement, lifecycle, and authority boundaries
- [`docs/product/mailbox-draft-send-posture.md`](mailbox-draft-send-posture.md) — Draft/send posture guide: supervised, semi-autonomous, and autonomous modes
- [`docs/product/mailbox-terminal-failures.md`](mailbox-terminal-failures.md) — Terminal failure reference: detection, operator signal, recovery, and prevention
- [`docs/product/first-operation-proof.md`](first-operation-proof.md) — End-to-end product proof (draft → approval → send → confirmation)
