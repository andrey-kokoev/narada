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
