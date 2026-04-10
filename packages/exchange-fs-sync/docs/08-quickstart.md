# Quickstart Guide

## Prerequisites

- **Node.js**: v18+ (tested on v20)
- **pnpm**: v8+ (package manager)
- **Microsoft Graph Access**: Azure AD app registration or access token

## Installation

```bash
# Clone repository
cd /path/to/narada

# Install dependencies
pnpm install

# Verify setup
pnpm typecheck
pnpm test
```

## First-Time Configuration

### Step 1: Create Config File

Copy the example and customize:

```bash
cp packages/exchange-fs-sync/config.example.json packages/exchange-fs-sync/config.json
```

Edit `config.json`:

```json
{
  "mailbox_id": "your-email@example.com",
  "root_dir": "./data",
  "graph": {
    "user_id": "your-email@example.com",
    "prefer_immutable_ids": true
  },
  "scope": {
    "included_container_refs": ["inbox"],
    "included_item_kinds": ["message"]
  }
}
```

### Step 2: Configure Authentication

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
mkdir -p packages/exchange-fs-sync/data
```

## First Sync

### Write a Test Script

Create `packages/exchange-fs-sync/test-sync.ts`:

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
  
  const tokenProvider = buildGraphTokenProvider({ config });
  const client = new GraphHttpClient({
    tokenProvider,
    preferImmutableIds: config.graph.prefer_immutable_ids,
  });
  
  const adapter = new DefaultGraphAdapter({
    mailbox_id: config.mailbox_id,
    user_id: config.graph.user_id,
    client,
    adapter_scope: {
      mailbox_id: config.mailbox_id,
      included_container_refs: config.scope.included_container_refs,
      included_item_kinds: config.scope.included_item_kinds,
      attachment_policy: config.normalize.attachment_policy,
      body_policy: config.normalize.body_policy,
    },
    body_policy: config.normalize.body_policy,
    attachment_policy: config.normalize.attachment_policy,
    include_headers: config.normalize.include_headers,
    normalize_folder_ref: (folderId) => [folderId ?? "unknown"],
    normalize_flagged: (flag) => flag?.flagStatus === "flagged",
  });
  
  const rootDir = config.root_dir;
  const cursorStore = new FileCursorStore({
    rootDir,
    mailboxId: config.mailbox_id,
  });
  const applyLogStore = new FileApplyLogStore({ rootDir });
  const messageStore = new FileMessageStore({ rootDir });
  const tombstoneStore = new FileTombstoneStore({ rootDir });
  const viewStore = new FileViewStore({ rootDir });
  const blobStore = new FileBlobStore({ rootDir });
  const lock = new FileLock({
    rootDir,
    acquireTimeoutMs: config.runtime.acquire_lock_timeout_ms,
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
            tombstones_enabled: config.normalize.tombstones_enabled,
          },
          event,
        ),
    },
    cleanupTmp: () => cleanupTmp({ rootDir }),
    acquireLock: () => lock.acquire(),
    rebuildViews: () => viewStore.rebuildAll(),
    rebuildViewsAfterSync: config.runtime.rebuild_views_after_sync,
  });
  
  console.log("Starting sync...");
  const result = await runner.syncOnce();
  console.log("Result:", JSON.stringify(result, null, 2));
}

main().catch(console.error);
```

### Run the Sync

```bash
cd packages/exchange-fs-sync
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

## Next Steps

1. **Read the spec**: [01-spec.md](01-spec.md) for theoretical understanding
2. **Understand architecture**: [02-architecture.md](02-architecture.md)
3. **Configure policies**: [06-configuration.md](06-configuration.md) for attachment/body handling
4. **Troubleshoot issues**: [09-troubleshooting.md](09-troubleshooting.md)

## Common First-Time Issues

### "No Graph auth configuration found"

Missing credentials. Check:
- `GRAPH_ACCESS_TOKEN` env var is set, OR
- `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` are set, OR
- Credentials are in config.json

### "Current implementation requires exactly one included_container_ref"

Config has multiple folders. Change to single folder:
```json
"scope": {
  "included_container_refs": ["inbox"]
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
