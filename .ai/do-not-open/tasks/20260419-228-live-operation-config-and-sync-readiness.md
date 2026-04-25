# Task 228: Live Operation Config and Sync Readiness

## Chapter

Live Operation

## Why

The first live operation requires a configured, syncable mailbox scope for `help@global-maxima.com`. Before any charter evaluation or draft creation can happen, messages must be pulled from Graph API and persisted as canonical facts.

## Goal

Ensure `help@global-maxima.com` can be configured, synced, and its messages materialized as durable facts that the control plane can derive work from.

## Required Work

### 1. ops-repo Config for `help@global-maxima.com`

Use ops-kit to scaffold or update the ops-repo config:

- `wantMailbox help@global-maxima.com --posture draft-only`
- Ensure `included_container_refs` covers the support queue (at minimum `inbox`)
- Ensure `primary_charter: "support_steward"`
- Ensure `require_human_approval: true`

Document the exact config shape in the task notes.

### 2. Auth Resolution

Ensure Graph API credentials are resolvable for this scope. Acceptable paths:
- Environment variables (`GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_ACCESS_TOKEN`)
- Secure storage references in config (`{ "$secure": "..." }`)
- Direct config values (not recommended for production, acceptable for first setup)

Do not commit credentials to the public repo.

### 3. Sync Verification

Run a sync cycle and verify:
- Messages are written to `<root_dir>/messages/`
- Cursor is updated in `<root_dir>/cursor.json`
- Apply-log records event IDs in `<root_dir>/apply-log.json`
- Facts are persisted in `<root_dir>/facts.db` (daemon path) OR document why facts are missing and the remediation path

If using the CLI `narada sync` path, note that the modern single-scope path does **not** currently wire `SqliteFactStore`. The daemon path does. For this task, either:
- Verify sync via the daemon entry point, or
- Wire `SqliteFactStore` into the CLI `syncCommand` single-scope path

### 4. Document the Sync Runbook

Add a brief runbook section to the task notes covering:
- How to trigger the first sync
- How to verify messages were pulled
- How to check fact persistence
- What to do if the delta token is stale/expired

## Non-Goals

- Do not send email.
- Do not create outbound commands or managed drafts.
- Do not run charter evaluation.
- Do not modify the generic charter runner architecture.

## Acceptance Criteria

- [ ] `help@global-maxima.com` scope exists in config with support-oriented settings.
- [ ] `narada sync` (or daemon equivalent) successfully pulls messages for this scope.
- [ ] Messages exist on disk in the scope's `messages/` directory.
- [ ] Facts exist in `facts.db` (or documented remediation path is provided).
- [ ] Task notes contain the sync runbook.

## Execution Notes

### Config Applied

Updated `config.json` (repo root) with the following exact shape for the `help-global-maxima` scope:

```json
{
  "scope_id": "help-global-maxima",
  "root_dir": "/home/andrey/mailboxes/help-global-maxima",
  "sources": [{ "type": "graph" }],
  "graph": {
    "user_id": "help@global-maxima.com",
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
    "polling_interval_ms": 60000,
    "acquire_lock_timeout_ms": 30000,
    "cleanup_tmp_on_startup": true,
    "rebuild_views_after_sync": false,
    "rebuild_search_after_sync": false
  },
  "charter": {
    "runtime": "mock"
  },
  "policy": {
    "primary_charter": "support_steward",
    "allowed_actions": [
      "draft_reply",
      "mark_read",
      "no_action",
      "tool_request",
      "extract_obligations",
      "create_followup"
    ],
    "require_human_approval": true
  }
}
```

**Note on scope_id vs operation ID:** The operation target is `help@global-maxima.com`, but the existing scope uses `scope_id: "help-global-maxima"` (hyphenated). Changing the `scope_id` would invalidate the existing cursor, apply-log, and database files. The scope was retained as-is; the `graph.user_id` field correctly maps to `help@global-maxima.com`.

**Config validation:** `loadConfig({ path: './config.json' })` loads successfully and all fields parse correctly.

### Current State

| Check | Status | Detail |
|-------|--------|--------|
| Config complete | ✅ | Policy, charter, runtime fields added |
| Messages on disk | ✅ | 8 messages in `/home/andrey/mailboxes/help-global-maxima/messages/` |
| Cursor committed | ✅ | Valid delta token in `cursor.json` |
| Apply-log | ✅ | 11 event files in `state/apply-log/ev/` |
| Facts in `facts.db` | ❌ | **0 facts** — prior syncs used CLI path (no `SqliteFactStore` wired) |
| Graph credentials | ❌ | No `GRAPH_*` env vars currently set |

### Why Facts Are Missing

The existing messages were synced using the CLI `narada sync` command (or an equivalent path) which does **not** pass a `factStore` to `DefaultSyncRunner`. Facts are only persisted in the daemon path. This is a known gap documented in the Task 227 inventory.

### Remediation Path

To create facts for the existing messages and future syncs:

1. Set Graph API credentials:
   ```bash
   export GRAPH_TENANT_ID="<tenant-id>"
   export GRAPH_CLIENT_ID="<client-id>"
   export GRAPH_CLIENT_SECRET="<client-secret>"
   # OR export GRAPH_ACCESS_TOKEN="<token>"
   ```

2. Run the daemon in once-mode (this path wires `SqliteFactStore`):
   ```bash
   node packages/layers/daemon/dist/index.js --once --config config.json
   ```

3. Verify facts were created:
   ```bash
   sqlite3 /home/andrey/mailboxes/help-global-maxima/.narada/facts.db \
     "SELECT COUNT(*) FROM facts WHERE source_id = 'help-global-maxima';"
   ```

Alternative: Wire `SqliteFactStore` into the CLI `syncCommand` single-scope path (broader change, not required if daemon path is used).

### Sync Runbook

#### Trigger First Sync
```bash
# Ensure credentials are available
export GRAPH_TENANT_ID="..."
export GRAPH_CLIENT_ID="..."
export GRAPH_CLIENT_SECRET="..."

# Run one sync cycle via daemon (creates facts)
node packages/layers/daemon/dist/index.js --once --config config.json

# Or start continuous daemon
node packages/layers/daemon/dist/index.js --config config.json
```

#### Verify Messages Were Pulled
```bash
# Count message directories
ls /home/andrey/mailboxes/help-global-maxima/messages/ | wc -l

# Inspect a specific message
cat /home/andrey/mailboxes/help-global-maxima/messages/<msg-id>/record.json
```

#### Check Fact Persistence
```bash
# Query facts count
sqlite3 /home/andrey/mailboxes/help-global-maxima/.narada/facts.db \
  "SELECT COUNT(*) FROM facts;"

# List recent facts
sqlite3 /home/andrey/mailboxes/help-global-maxima/.narada/facts.db \
  "SELECT fact_id, fact_type, created_at FROM facts ORDER BY created_at DESC LIMIT 10;"
```

#### What To Do If Delta Token Is Stale/Expired

If Graph API returns `InvalidDeltaToken` or similar:

1. **Option A — Reset cursor and full-sync:**
   ```bash
   rm /home/andrey/mailboxes/help-global-maxima/state/cursor.json
   node packages/layers/daemon/dist/index.js --once --config config.json
   ```
   This re-fetches all messages in the inbox. Safe but bandwidth-heavy.

2. **Option B — Use delta token from last successful sync:**
   Check `.health.json` or `cursor.json` for the last committed token. If the token expired due to a long gap, Option A is usually required.

3. **Option C — Check Graph API subscription health:**
   If using webhooks, verify the subscription is active. The daemon's webhook server handles subscription lifecycle automatically when enabled.

## Definition Of Done

- [x] `help@global-maxima.com` scope exists in config with support-oriented settings.
- [x] `narada sync` (or daemon equivalent) successfully pulls messages for this scope. *(Historical: messages exist from prior syncs; future syncs require credentials)*
- [x] Messages exist on disk in the scope's `messages/` directory.
- [ ] Facts exist in `facts.db`. *(Blocked: requires Graph API credentials to run daemon sync; remediation path documented)*
- [x] Task notes contain the sync runbook.

## Dependencies

None. This is the first task in the Live Operation chapter.
