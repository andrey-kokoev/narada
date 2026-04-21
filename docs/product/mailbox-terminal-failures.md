# Mailbox Terminal Failures

> **Scope**: Definitive reference for terminal failures in the mailbox vertical that require operator intervention.  
> **Audience**: Operators running Narada in production against live Exchange/Graph mailboxes.  
> **Last updated**: 2026-04-20

---

## What Is a Terminal Failure?

A **terminal failure** is a fault that cannot be resolved by automatic retry within the bounded Cycle. It leaves an artifact in `failed_terminal` status (or an equivalent stuck state) and requires an explicit operator action to recover or reject.

Terminal failures are distinct from **retryable failures** (`failed_retryable`), which the scheduler will automatically reattempt according to backoff policy. A retryable failure becomes terminal only when:

- The retry budget is exhausted (default 3 attempts).
- The error is classified as non-retryable at the source (e.g., `400` bad request, auth revoked).
- A safety invariant is violated (e.g., external draft mutation detected).

---

## Failure Reference

### 1. Graph API Auth Expired or Revoked

**Detection**

| Where | What to Look For |
|-------|------------------|
| **Sync step** | Graph API returns `401 Unauthorized` or `403 Forbidden`. `GraphHttpClient` calls `tokenProvider.invalidateAccessToken()`. Sync aborts with `GRAPH_AUTH_FAILED` (non-recoverable). |
| **Outbound worker** | `send_reply` or `non_send_actions` worker receives `401`/`403` during draft creation, verification, or send. Command transitions to `failed_terminal` with auth-related `terminal_reason`. |
| **CLI / observation** | `narada ops` shows `failed_terminal` commands with `terminal_reason` containing "auth" (case-insensitive). `narada doctor` flags auth health as `fail`. |

**What the Operator Sees**

- `narada ops` Attention Queue lists auth-failed terminals.
- `narada doctor` reports: `Graph auth: FAILED — credential rejected by Microsoft identity platform`.
- Daemon logs show: `GraphAuthError: 401 Unauthorized` or `403 Forbidden` with `error: invalid_client` or conditional-access denial.

**Recovery Procedure**

1. Identify the failure type:
   ```bash
   narada doctor
   narada ops --limit 20
   ```
2. Fix credentials at the source:
   - Renewed access token in env var (`GRAPH_ACCESS_TOKEN`) or secure storage.
   - Rotated client secret in Azure AD app registration.
   - Resolved conditional-access policy block.
3. Retry the affected commands:
   ```bash
   # Bulk retry all auth-failed commands
   narada retry-auth-failed

   # Retry a specific command
   narada retry-auth-failed <outbound-id>
   ```
4. Verify recovery:
   ```bash
   narada doctor
   narada ops
   ```

**What `retry-auth-failed` does:**
- Scans `failed_terminal` commands where `terminal_reason` contains "auth".
- Transitions `send_reply` / `send_new_message` → `approved_for_send`.
- Transitions `draft_reply` / `mark_read` / `move_message` / `set_categories` → `draft_ready`.
- Clears `terminal_reason` so workers can pick them up.
- Appends audit transition: `failed_terminal → <target>` with reason `operator_retry_after_auth_restored`.

**Prevention**

- Use `SharedTokenProvider` or `ClientCredentialsTokenProvider` with automatic refresh. These invalidate the cache 60 seconds before TTL and fetch new tokens transparently.
- Monitor `narada doctor` output in a cron or health check.
- Do not hardcode long-lived tokens in config files; use secure storage references or short-lived env vars.

---

### 2. Charter Evaluation Repeatedly Errors

**Detection**

| Where | What to Look For |
|-------|------------------|
| **Scheduler / execution** | A `work_item` is claimed, an `execution_attempt` starts, and the charter runtime throws or returns an error envelope. The scheduler releases the lease and marks the attempt `crashed`. After 3 consecutive crashes, the foreman transitions the work item to `failed_terminal`. |
| **Foreman resolution** | `resolveWorkItem()` receives an evaluation with `outcome: "error"` or a missing/invalid action payload. If retry budget is exhausted, the foreman calls `failWorkItem()` with `failed_terminal`. |
| **CLI / observation** | `narada ops` Attention Queue shows a work item stuck in `failed_retryable` (early) or `failed_terminal` (late). `narada show execution <id>` reveals the error detail. |

**What the Operator Sees**

- `narada ops` shows the work item in the Attention Queue with status `failed_retryable` or `failed_terminal`.
- `narada show execution <execution-id>` displays:
  - Charter runtime error message (e.g., JSON parse failure, tool invocation error, timeout).
  - Token usage and latency (if the error occurred after partial execution).
  - Model reference and session linkage.
- Daemon logs show: `CharterRuntimeError: ...` or `EvaluationError: ...`.

**Recovery Procedure**

1. Inspect the failing execution:
   ```bash
   narada show execution <execution-id>
   ```
2. Determine the root cause:
   - **Charter config error** (bad model name, invalid temperature, missing API key) → fix `config.json` and restart daemon.
   - **Message context too large** → the context formation strategy produced an oversized envelope. This is rare; if it recurs, file a bug.
   - **Knowledge file corruption** → check `knowledge/*.md` for malformed content that crashes the prompt template.
   - **Charter runtime endpoint down** → verify network and API key validity.
3. If the work item is `failed_retryable`, the scheduler will retry automatically once the root cause is fixed. To force immediate retry:
   ```bash
   narada ops
   # Identify the work_item_id
   # Use the operator action surface to promote retry readiness
   ```
4. If the work item is `failed_terminal`, you may need to run recovery derivation or acknowledge the failure:
   ```bash
   # Preview what a re-derivation would do (read-only)
   narada derive-work --scope <scope-id> --dry-run
   ```
   If the context has new facts since the failure, a fresh derivation may open a new work item with a clean execution attempt.

**Prevention**

- Run `narada doctor` regularly to catch charter runtime endpoint failures early.
- Keep knowledge files valid Markdown; test prompt templates after edits.
- Use the `preview derivation` operator (`narada derive-work --dry-run`) before activating a new charter config.
- Set reasonable `execution_timeout_ms` to prevent indefinite hangs.

---

### 3. Outbound Send Rejected by Graph

**Detection**

| Where | What to Look For |
|-------|------------------|
| **SendReplyWorker** | Graph API returns `400 Bad Request` or `403 Forbidden` during `createDraft` or `send`. The worker transitions the command to `failed_terminal` and records the Graph error detail in `terminal_reason`. |
| **Non-send worker** | `move_message` or `set_categories` receives `400`/`403` (e.g., permission denied on a shared mailbox). Same terminal transition. |
| **CLI / observation** | `narada ops` shows `failed_terminal` with a Graph error code in `terminal_reason`. |

**What the Operator Sees**

- `narada ops` lists the command as `failed_terminal`.
- `narada show outbound <outbound-id>` reveals:
  - The proposed draft payload (subject, body, recipients).
  - The Graph error response (e.g., `InvalidRecipients`, `MessageSizeExceeded`, `PermissionDenied`).
  - The decision and evaluation that produced the draft.

**Recovery Procedure**

1. Inspect the failed command:
   ```bash
   narada show outbound <outbound-id>
   ```
2. Classify the Graph error:
   - **Invalid recipient** (e.g., external domain blocked) → edit the draft payload or adjust Graph admin policies.
   - **Permission denied** → verify the app registration has `Mail.Send` and `Mail.ReadWrite` permissions.
   - **Message size exceeded** → the draft is too large (attachments not supported in outbound draft creation; see known gap in `day-2-mailbox-hardening.md`).
   - **Bad request / malformed payload** → review charter output; the evaluation may have produced invalid content.
3. If the draft is valid and the error was transient (rare for `400`), retry:
   ```bash
   narada retry-auth-failed <outbound-id>
   ```
   Or manually transition via the operator action surface.
4. If the draft is invalid or the error is permanent, reject it:
   ```bash
   narada reject-draft <outbound-id> --rationale "Graph rejected: <reason>"
   ```

**Prevention**

- Restrict `allowed_actions` to what the Graph app registration is actually permissioned for.
- Review charter output quality regularly; malformed recipient lists or oversized bodies are charter bugs.
- Use `degraded_mode: "draft_only"` when testing a new charter to catch bad drafts before they reach send.

---

### 4. Sync Cursor Corrupted or Invalid Delta Token

**Detection**

| Where | What to Look For |
|-------|------------------|
| **Sync step** | `sync-once` reads the cursor file (`<rootDir>/.cursor/<scope-id>.json`) and finds invalid JSON, a missing `deltaToken`, or a token that Graph rejects with `InvalidDeltaToken`. |
| **Runner** | Sync aborts with `GRAPH_SYNC_FAILED` or a cursor parse error. The health file is not updated. |
| **CLI / observation** | `narada doctor` reports stale sync: `lastSyncAt` is older than the configured threshold. `narada ops` shows no recent activity. |

**What the Operator Sees**

- `narada doctor` reports: `Sync health: STALE — last successful sync was <timestamp>`.
- `narada ops` Recent Activity is empty or shows only old evaluations.
- Daemon logs show: `CursorError: invalid JSON` or `GraphSyncError: InvalidDeltaToken`.

**Recovery Procedure**

1. Confirm the cursor is the problem:
   ```bash
   cat <rootDir>/.cursor/<scope-id>.json
   narada doctor
   ```
2. Delete the corrupted cursor:
   ```bash
   rm <rootDir>/.cursor/<scope-id>.json
   ```
3. Trigger a full re-sync:
   ```bash
   # For daemon: trigger sync via operator action surface
   # For CLI manual run:
   narada sync --scope <scope-id>
   ```
4. Monitor the sync:
   - The first sync without a cursor performs a full backfill. This may take longer than a delta sync.
   - The apply-log prevents duplicate event application for facts already ingested.
   - A new cursor is written after successful sync completion.
5. Verify:
   ```bash
   narada doctor
   narada ops
   ```

**Prevention**

- Do not manually edit cursor files.
- Ensure atomic writes: Narada writes cursors to a temp file and renames it. If your Site uses a network filesystem that does not support atomic rename, cursor corruption is more likely.
- Monitor `lastSyncAt` via `narada doctor` or health file polling.

---

### 5. Disk or Storage Full

**Detection**

| Where | What to Look For |
|-------|------------------|
| **Persistence layer** | Atomic write (`write to tmp → rename`) fails with `ENOSPC`. SQLite returns `SQLITE_FULL` (error code 13). |
| **Coordinator store** | `INSERT` or `UPDATE` throws `SQLITE_FULL`. The current transaction rolls back. |
| **Fact store** | Write to the messages directory or fact SQLite fails with disk-full error. |
| **CLI / observation** | `narada doctor` may fail to open the database. `narada ops` may hang or return errors. Daemon logs show `ENOSPC` or `SQLITE_FULL`. |

**What the Operator Sees**

- `narada ops` or `narada doctor` fails with database errors.
- Daemon logs show: `Error: database or disk is full` or `Error: ENOSPC: no space left on device`.
- The daemon may appear to hang because it cannot commit sync progress or outbound transitions.

**Recovery Procedure**

1. Free disk space immediately:
   ```bash
   # Check disk usage
   df -h <rootDir>

   # Check Narada-specific consumers
   du -sh <rootDir>/logs
   du -sh <rootDir>/.traces
   du -sh <rootDir>/messages
   du -sh <rootDir>/coordinator.db
   ```
2. Rotate or archive logs:
   ```bash
   mv <rootDir>/logs/daemon.log <rootDir>/logs/daemon.log.$(date +%Y%m%d)
   # Compress old logs
   gzip <rootDir>/logs/daemon.log.*
   ```
3. Archive old traces (non-authoritative):
   ```bash
   mkdir -p <rootDir>/archive/traces
   mv <rootDir>/.traces/*-<older-than-30d>.jsonl <rootDir>/archive/traces/
   ```
4. Expand storage if possible (resize volume, move ops repo to larger disk).
5. Restart the daemon after space is freed:
   ```bash
   narada doctor
   narada ops
   ```
6. Inspect for data corruption: If `SQLITE_FULL` occurred mid-transaction, the database may be in a consistent state (SQLite rolls back), but run:
   ```bash
   sqlite3 <rootDir>/coordinator.db "PRAGMA integrity_check;"
   ```

**Prevention**

- Set up log rotation (e.g., `logrotate`) for `<rootDir>/logs/daemon.log`.
- Monitor disk usage via system monitoring (e.g., Datadog, Prometheus node exporter).
- Narada does not automatically prune old traces or logs. Operators must manage retention.
- Consider periodic `narada rebuild-projections` to compact derived stores if they grow large.

---

### 6. External Draft Mutation Detected

**Detection**

| Where | What to Look For |
|-------|------------------|
| **SendReplyWorker** | Pre-send verification computes a hash of body, recipients, subject, and `X-Outbound-Id`. If the managed draft was modified in Graph/Outlook by a human or another process, the hash mismatches. The worker transitions the command to `failed_terminal` with `terminal_reason: "External modification detected"`. |
| **CLI / observation** | `narada ops` shows `failed_terminal` with the external-modification reason. |

**What the Operator Sees**

- `narada show outbound <outbound-id>` shows the expected payload and the verification failure.
- The draft in Graph/Outlook has different content than what Narada created.

**Recovery Procedure**

1. Inspect the draft in Graph/Outlook and compare with the expected payload:
   ```bash
   narada show outbound <outbound-id>
   ```
2. Determine intent:
   - **Intentional modification** (human edited the draft) → re-approve the modified draft if acceptable, or reject it and let the charter regenerate.
   - **Unintentional / unknown modification** → treat as potential account compromise.
3. If intentional:
   ```bash
   # Manually transition back to draft_ready and re-approve
   # (use operator action surface or manual SQL if the action is not yet safelisted)
   ```
4. If unintentional:
   - Revoke credentials immediately.
   - Investigate account access logs.
   - Set `degraded_mode: "draft_only"` until root cause is found.

**Prevention**

- Use dedicated service accounts for Narada; do not share credentials with human users.
- Enable audit logging in Graph/Exchange.
- Use `degraded_mode: "draft_only"` during security investigations.

---

### 7. Max Retries Exceeded

**Detection**

| Where | What to Look For |
|-------|------------------|
| **Worker** | A `failed_retryable` command is retried up to the configured limit (default 3). After the final retry, the worker transitions it to `failed_terminal` with `terminal_reason: "max_retries_exceeded"`. |
| **CLI / observation** | `narada ops` shows `failed_terminal` with retry-exceeded reason. |

**What the Operator Sees**

- `narada show outbound <outbound-id>` shows the retry history and the final error.
- The underlying error (auth, Graph 500, network timeout) is recorded in earlier transition logs.

**Recovery Procedure**

1. Identify the root cause from earlier attempts:
   ```bash
   narada show outbound <outbound-id>
   # Or inspect the daemon logs for the original error
   grep <outbound-id> <rootDir>/logs/daemon.log
   ```
2. Fix the root cause (auth, network, config, Graph permissions).
3. Retry manually:
   ```bash
   narada retry-auth-failed <outbound-id>
   ```
   Or use the operator action surface for generic retry.

**Prevention**

- Fix root causes promptly before retry budgets are exhausted.
- Monitor `narada ops` Attention Queue for `failed_retryable` items and address them early.

---

## Quick Reference: Operator First Response

| Failure | First Command | Second Command |
|---------|---------------|----------------|
| Auth expired | `narada doctor` | `narada retry-auth-failed` |
| Charter errors | `narada show execution <id>` | Fix config / knowledge; check daemon logs |
| Send rejected | `narada show outbound <id>` | Retry or reject based on Graph error |
| Cursor corrupted | `rm <rootDir>/.cursor/<scope-id>.json` | Trigger re-sync |
| Disk full | `df -h` + free space | `sqlite3 coordinator.db "PRAGMA integrity_check;"` |
| External mutation | `narada show outbound <id>` | Inspect Graph draft; revoke credentials if suspicious |
| Max retries | `narada show outbound <id>` | Fix root cause, then retry manually |

---

## Related Documents

- [`docs/product/day-2-mailbox-hardening.md`](day-2-mailbox-hardening.md) — Operational failure modes, recovery drills, and hardening gaps
- [`docs/product/mailbox-draft-send-posture.md`](mailbox-draft-send-posture.md) — Draft/send posture and the `require_human_approval` policy field
- [`docs/product/operator-loop.md`](operator-loop.md) — Canonical five-step operator live loop
- [`docs/concepts/mailbox-knowledge-model.md`](../concepts/mailbox-knowledge-model.md) — Knowledge durability, scoping, and lifecycle
