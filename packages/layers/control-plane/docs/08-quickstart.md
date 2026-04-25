# Quickstart Guide

> **Scope of this guide**: This quickstart uses the Microsoft Exchange/Graph mailbox vertical because it is the first mature vertical and the easiest way to see the kernel in action. Timer, webhook, filesystem, and process automations are first-class peers that use the exact same pipeline.

## Prerequisites

- **Node.js**: v18+ (tested on v20)
- **Microsoft Graph Access**: Azure AD app registration or access token

## Method 1: CLI (Recommended for Users)

### Installation

```bash
npm install -g @narada2/cli
# or
pnpm add -g @narada2/cli
```

### First-Time Setup

```bash
# Interactive configuration
narada init --interactive

# Follow the prompts:
# - Enter your email address
# - Choose data directory (default: ./data)
# - Set Graph API credentials (or use env vars)
# - Select one or more folders to sync
# - Test connection before saving
```

### Run Your First Sync

```bash
# Run sync for the configured folder scope
narada sync

# Check status
narada status

# View results
ls ./data/messages | wc -l
```

### Create Your First Backup

```bash
# Create encrypted backup
narada backup -o backup-$(date +%Y%m%d).tar.gz --encrypt

# Verify backup
narada backup-verify -i backup-$(date +%Y%m%d).tar.gz

# List contents
narada backup-ls -i backup-$(date +%Y%m%d).tar.gz
```

## Method 2: Library (For Developers)

### Installation

```bash
# Clone repository
cd /path/to/narada

# Install dependencies
pnpm install

# Verify setup
pnpm typecheck
pnpm test:unit
```

### First-Time Configuration

Copy the example and customize:

```bash
cp packages/layers/control-plane/config.example.json packages/layers/control-plane/config.json
```

Edit `config.json`:

```json
{
  "root_dir": "./data",
  "scopes": [
    {
      "scope_id": "your-email@example.com",
      "sources": [{ "type": "graph" }],
      "graph": {
        "user_id": "your-email@example.com",
        "prefer_immutable_ids": true
      },
      "scope": {
        "included_container_refs": ["inbox", "sentitems"],
        "included_item_kinds": ["message"]
      },
      "admission": {
        "mail": {
          "included_folder_refs": ["inbox"]
        }
      }
    }
  ]
}
```

### Configure Authentication

Choose one method:

#### Method A: Environment Variables (Recommended for Secrets)

```bash
export GRAPH_TENANT_ID="your-tenant.onmicrosoft.com"
export GRAPH_CLIENT_ID="your-app-id"
export GRAPH_CLIENT_SECRET="your-app-secret"
```

#### Method B: Access Token (Quick Testing)

```bash
export GRAPH_ACCESS_TOKEN="eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6..."
```

Get a token via [Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer) or Azure CLI.

## Current Scope

The current Graph delta implementation is folder-scoped, not whole-mailbox scoped.
Configure one or more entries in `scope.included_container_refs`, such as
`["inbox", "sentitems"]`. Use `admission.mail.included_folder_refs` or
`admission.mail.excluded_folder_refs` when some synced folders are context only
and should not produce admitted work.

#### Method C: Config File (Not Recommended for Secrets)

Add to `config.json`:

```json
{
  "graph": {
    "tenant_id": "your-tenant.onmicrosoft.com",
    "client_id": "your-app-id",
    "client_secret": "your-app-secret",
    "user_id": "your-email@example.com",
    "prefer_immutable_ids": true
  }
}
```

### Step 3: Create Data Directory

```bash
mkdir -p packages/layers/control-plane/data
```

## First Sync

### Write a Test Script

Create `packages/layers/control-plane/test-sync.ts`:

```typescript
import { loadConfig } from "./src/config/load.js";
import { buildGraphTokenProvider } from "./src/config/token-provider.js";
import { GraphHttpClient } from "./src/adapter/graph/client.js";
import { DefaultGraphAdapter } from "./src/adapter/graph/adapter.js";
import { DefaultSyncRunner } from "./src/runner/sync-once.js";
import { FileCursorStore } from "./src/persistence/cursor.js";
import { FileApplyLogStore } from "./src/persistence/apply-log.js";
import { FileMessageStore } from "./src/persistence/messages.js";
import { FileTombstoneStore } from "./src/persistence/tombstones.js";
import { FileViewStore } from "./src/persistence/views.js";
import { FileBlobStore } from "./src/persistence/blobs.js";
import { FileLock } from "./src/persistence/lock.js";
import { applyEvent } from "./src/projector/apply-event.js";
import { cleanupTmp } from "./src/recovery/cleanup-tmp.js";

async function main() {
  const config = await loadConfig({ path: "./config.json" });
  
  const scope = config.scopes[0];
  const tokenProvider = buildGraphTokenProvider({ config: scope });
  const client = new GraphHttpClient({
    tokenProvider,
    preferImmutableIds: scope.graph.prefer_immutable_ids,
  });
  
  const adapter = new DefaultGraphAdapter({
    mailbox_id: scope.scope_id,
    user_id: scope.graph.user_id,
    client,
    adapter_scope: {
      mailbox_id: scope.scope_id,
      included_container_refs: scope.scope.included_container_refs,
      included_item_kinds: scope.scope.included_item_kinds,
      attachment_policy: scope.normalize.attachment_policy,
      body_policy: scope.normalize.body_policy,
    },
    body_policy: scope.normalize.body_policy,
    attachment_policy: scope.normalize.attachment_policy,
    include_headers: scope.normalize.include_headers,
    normalize_folder_ref: (message) => [message.parentFolderId ?? "unknown"],
    normalize_flagged: (flag) => flag?.flagStatus === "flagged",
  });
  
  const rootDir = scope.root_dir;
  const cursorStore = new FileCursorStore({
    rootDir,
    mailboxId: scope.scope_id,
  });
  const applyLogStore = new FileApplyLogStore({ rootDir });
  const messageStore = new FileMessageStore({ rootDir });
  const tombstoneStore = new FileTombstoneStore({ rootDir });
  const viewStore = new FileViewStore({ rootDir });
  const blobStore = new FileBlobStore({ rootDir });
  const lock = new FileLock({
    rootDir,
    acquireTimeoutMs: scope.runtime.acquire_lock_timeout_ms,
  });
  
  const runner = new DefaultSyncRunner({
    rootDir,
    adapter,
    cursorStore,
    applyLogStore,
    projector: {
      applyEvent: (event) =>
        applyEvent(
          {
            blobs: blobStore,
            messages: messageStore,
            tombstones: tombstoneStore,
            views: viewStore,
            tombstones_enabled: scope.normalize.tombstones_enabled,
          },
          event,
        ),
    },
    cleanupTmp: () => cleanupTmp({ rootDir }),
    acquireLock: () => lock.acquire(),
    rebuildViews: () => viewStore.rebuildAll(),
    rebuildViewsAfterSync: scope.runtime.rebuild_views_after_sync,
  });
  
  console.log("Starting sync...");
  const result = await runner.syncOnce();
  console.log("Result:", JSON.stringify(result, null, 2));
}

main().catch(console.error);
```

### Run the Sync

```bash
cd packages/layers/control-plane
npx tsx test-sync.ts
```

Expected output:
```json
{
  "prior_cursor": null,
  "next_cursor": "https://graph.microsoft.com/v1.0/...",
  "event_count": 50,
  "applied_count": 50,
  "skipped_count": 0,
  "duration_ms": 3245,
  "status": "success"
}
```

## Verify Results

### Check Stored Messages

```bash
# Count messages
ls data/messages | wc -l

# View a message
cat "data/messages/$(echo 'message-id' | jq -sRr @uri)/record.json" | jq .

# Check cursor
cat data/state/cursor.json | jq .

# Count applied events
find data/state/apply-log -name "*.json" | wc -l
```

### Check Views

```bash
# List conversations
ls data/views/by-thread/

# List unread messages
ls data/views/unread/

# List flagged messages
ls data/views/flagged/
```

## Incremental Sync

Run the same script again—it will only fetch new changes:

```bash
npx tsx test-sync.ts
```

Expected output:
```json
{
  "prior_cursor": "https://graph.microsoft.com/v1.0/...",
  "next_cursor": "https://graph.microsoft.com/v1.0/...",
  "event_count": 0,
  "applied_count": 0,
  "skipped_count": 0,
  "duration_ms": 890,
  "status": "success"
}
```

## Backup and Restore (CLI)

### Create Backup

```bash
# Create basic backup
narada backup -o backup-$(date +%Y%m%d).tar.gz

# Create encrypted backup
narada backup -o backup-$(date +%Y%m%d).tar.gz --encrypt

# Backup specific components only
narada backup -o backup.tar.gz --include messages,config
```

### Verify Backup

```bash
# Verify integrity without extracting
narada backup-verify -i backup.tar.gz

# List contents
narada backup-ls -i backup.tar.gz
```

### Restore from Backup

```bash
# Restore everything
narada restore -i backup.tar.gz

# Restore to different location
narada restore -i backup.tar.gz -t ./restored-data

# Restore specific message
narada restore -i backup.tar.gz --select msg-123

# Restore only messages before a date
narada restore -i backup.tar.gz --before 2024-01-01
```

## Next Steps

1. **Read the spec**: [01-spec.md](01-spec.md) for theoretical understanding
2. **Understand architecture**: [02-architecture.md](02-architecture.md)
3. **Configure policies**: [06-configuration.md](06-configuration.md) for attachment/body handling
4. **Troubleshoot issues**: [09-troubleshooting.md](09-troubleshooting.md)
5. **CLI reference**: See `packages/layers/cli/README.md` for all CLI commands

## Common First-Time Issues

### "No Graph auth configuration found"

Missing credentials. Check:
- `GRAPH_ACCESS_TOKEN` env var is set, OR
- `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` are set, OR
- Credentials are in config.json

### Sent mail syncs as new work

`sentitems` is in source scope without an admission folder filter. Keep it in
source scope for thread context and restrict mail admission to incoming folders:
```json
"scope": {
  "included_container_refs": ["inbox", "sentitems"],
  "included_item_kinds": ["message"]
},
"admission": {
  "mail": {
    "included_folder_refs": ["inbox"]
  }
}
```

### Lock timeout

Another process is running, or a previous run crashed without releasing lock. Wait 5 minutes (stale lock detection) or manually remove `data/state/sync.lock/`.

### Empty batch

Normal for accounts with no recent changes. The sync succeeded, just nothing to fetch.

## Cleanup

```bash
# Remove all data
rm -rf data/*

# Or remove everything including temp files
rm -rf data tmp
```

---

## See Also

- [06-configuration.md](06-configuration.md) — Full configuration reference
- [07-graph-adapter.md](07-graph-adapter.md) — Understanding the Graph integration
- [09-troubleshooting.md](09-troubleshooting.md) — When things go wrong
- [Package AGENTS.md](../AGENTS.md) — Package structure and conventions
