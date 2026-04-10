# Configuration

## Overview

Configuration is loaded from JSON files and environment variables. The system uses explicit validation at load time—no partial configs or silent fallbacks for required fields.

---

## Configuration Schema

### TypeScript Interface

```typescript
interface ExchangeFsSyncConfig {
  mailbox_id: string;                    // Logical mailbox identifier
  root_dir: string;                      // Base directory for all data

  graph: {
    tenant_id?: string;                  // Azure AD tenant
    client_id?: string;                  // App registration ID
    client_secret?: string;              // App secret
    user_id: string;                     // Mailbox owner
    base_url?: string;                   // Graph API endpoint
    prefer_immutable_ids: boolean;       // Use immutable message IDs
  };

  scope: {
    included_container_refs: string[];   // Folder IDs to sync
    included_item_kinds: string[];       // Item types ("message")
  };

  normalize: {
    attachment_policy: "exclude" | "metadata_only" | "include_content";
    body_policy: "text_only" | "html_only" | "text_and_html";
    include_headers: boolean;            // Store internet message headers
    tombstones_enabled: boolean;         // Keep deletion records
  };

  runtime: {
    polling_interval_ms: number;         // Sync frequency
    acquire_lock_timeout_ms: number;     // Lock acquisition timeout
    cleanup_tmp_on_startup: boolean;     // Clean tmp/ on start
    rebuild_views_after_sync: boolean;   // Rebuild views each cycle
  };
}
```

---

## Configuration File

### Example (`config.example.json`)

```json
{
  "mailbox_id": "user@example.com",
  "root_dir": "./data",
  
  "graph": {
    "user_id": "user@example.com",
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
    "rebuild_views_after_sync": false
  }
}
```

### Loading

```typescript
import { loadConfig } from "./config/load";

const config = await loadConfig({ path: "./config.json" });
```

**Validation Errors**:
- Missing required field → throws with path (e.g., `"config.graph.user_id must be a non-empty string"`)
- Wrong type → throws with expected type
- Empty string → treated as missing

---

## Environment Variables

### Graph Authentication

Authentication can be provided via environment (safer for secrets) or config file:

| Variable | Purpose | Priority |
|----------|---------|----------|
| `GRAPH_ACCESS_TOKEN` | Bearer token for direct auth | Highest |
| `GRAPH_TENANT_ID` | Azure AD tenant | Falls back to config |
| `GRAPH_CLIENT_ID` | App registration ID | Falls back to config |
| `GRAPH_CLIENT_SECRET` | App secret | Falls back to config |

### Priority Order

```
1. GRAPH_ACCESS_TOKEN → StaticBearerTokenProvider
2. GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET → ClientCredentialsTokenProvider
3. config.graph.tenant_id/client_id/client_secret → ClientCredentialsTokenProvider
4. None → Error
```

### Token Provider Selection

```typescript
function buildGraphTokenProvider(opts: { config: ExchangeFsSyncConfig }): GraphTokenProvider {
  const env = loadGraphEnv();

  // 1. Static token from environment
  if (env.access_token) {
    return new StaticBearerTokenProvider({ accessToken: env.access_token });
  }

  // 2. Client credentials from env or config
  const tenantId = env.tenant_id ?? cfg.graph.tenant_id;
  const clientId = env.client_id ?? cfg.graph.client_id;
  const clientSecret = env.client_secret ?? cfg.graph.client_secret;

  if (tenantId && clientId && clientSecret) {
    return new ClientCredentialsTokenProvider({
      tenantId, clientId, clientSecret,
    });
  }

  throw new Error("No Graph auth configuration found");
}
```

---

## Authentication Methods

### Method 1: Static Access Token

Use for testing or when you have a pre-obtained token:

```bash
export GRAPH_ACCESS_TOKEN="eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6..."
```

Config file needs minimal Graph config:
```json
{
  "graph": {
    "user_id": "user@example.com",
    "prefer_immutable_ids": true
  }
}
```

### Method 2: Client Credentials

For daemon/service scenarios:

```bash
export GRAPH_TENANT_ID="contoso.onmicrosoft.com"
export GRAPH_CLIENT_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
export GRAPH_CLIENT_SECRET="secret-from-app-registration"
```

Or in config:
```json
{
  "graph": {
    "tenant_id": "contoso.onmicrosoft.com",
    "client_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "client_secret": "secret",
    "user_id": "user@example.com",
    "prefer_immutable_ids": true
  }
}
```

### Token Caching

`ClientCredentialsTokenProvider` caches tokens:

```typescript
interface CachedToken {
  accessToken: string;
  expiresAtEpochMs: number;  // Actual expiry minus 60s skew
}
```

- Refreshes 60 seconds before expiry
- Thread-safe (single instance shared)

---

## Secure Credential Storage

The system supports storing credentials in your OS keychain for enhanced security.

### Supported Keychains

| Platform | Keychain |
|----------|----------|
| macOS | Keychain Access |
| Windows | Credential Manager |
| Linux | libsecret (GNOME Keyring, KWallet) |

### Using Secure Storage

Credentials can be referenced in config using the `{ "$secure": "key" }` syntax:

```json
{
  "graph": {
    "client_secret": { "$secure": "graph_client_secret" },
    "tenant_id": { "$secure": "graph_tenant_id" }
  }
}
```

The actual values are stored securely and resolved at runtime.

### Fallback Encryption

If no OS keychain is available, credentials are encrypted using AES-256-GCM with a key derived from your user account. Encryption keys are stored with 0600 permissions in `~/.exchange-fs-sync/credentials/`.

### Programmatic API

```typescript
import { createSecureStorage } from '@narada/exchange-fs-sync';

const storage = await createSecureStorage('my-mailbox');
await storage.setCredential('client_secret', 'secret-value');
const secret = await storage.getCredential('client_secret');
```

---

## Default Values

Fields not provided use these defaults:

```typescript
const DEFAULTS = {
  normalize: {
    attachment_policy: "metadata_only",
    body_policy: "text_only",
    include_headers: false,
    tombstones_enabled: true,
  },
  runtime: {
    polling_interval_ms: 60_000,      // 1 minute
    acquire_lock_timeout_ms: 30_000,  // 30 seconds
    cleanup_tmp_on_startup: true,
    rebuild_views_after_sync: false,
  },
};
```

**Note**: No defaults for `mailbox_id`, `root_dir`, `graph.user_id`, or `scope` fields—these are always required.

---

## Scope Configuration

### Current Limitation

The current implementation requires exactly one folder:

```json
{
  "scope": {
    "included_container_refs": ["inbox"]
  }
}
```

Multiple folders will throw:
```
Error: Current implementation requires exactly one included_container_ref
```

### Folder Reference Formats

Folder refs can be:
- Graph folder ID: `"AQMkADAwATM0..."`
- Well-known name: `"inbox"`, `"sentitems"`, `"drafts"`, `"deleteditems"`

The adapter resolves these to Graph API paths.

---

## Normalization Policies

### Attachment Policy

| Policy | Behavior |
|--------|----------|
| `exclude` | No attachment data stored |
| `metadata_only` | Filename, size, content-type stored |
| `include_content` | Full base64 content stored |

**Note**: `include_content` increases storage significantly. Blobs are content-addressed, so identical attachments are deduplicated.

### Body Policy

| Policy | Stored |
|--------|--------|
| `text_only` | `body.text` only |
| `html_only` | `body.html` only |
| `text_and_html` | Both versions |

Graph API provides both content types; this controls which are persisted.

---

## Runtime Configuration

### Polling Interval

```json
{
  "runtime": {
    "polling_interval_ms": 60000
  }
}
```

- Minimum practical: 10000 (10 seconds) - Graph API rate limits apply
- Default: 60000 (1 minute)
- For one-shot sync (no polling): Not used by `syncOnce()`

### Lock Timeout

```json
{
  "runtime": {
    "acquire_lock_timeout_ms": 30000
  }
}
```

- How long to wait for exclusive lock
- Exceeding this throws retryable error
- Should be longer than expected sync duration

### Cleanup on Startup

```json
{
  "runtime": {
    "cleanup_tmp_on_startup": true
  }
}
```

- Removes temp files older than 24 hours
- Runs before first sync
- Safe to enable (only removes `.tmp` files)

### View Rebuilding

```json
{
  "runtime": {
    "rebuild_views_after_sync": false
  }
}
```

- `true`: Full view rebuild after each sync (slower, always consistent)
- `false`: Incremental view updates (faster, eventually consistent)

---

## Configuration Validation

### Validation Functions

```typescript
// Type guards
function isNonEmptyString(value: unknown): value is string;
function isBoolean(value: unknown): value is boolean;
function isPositiveNumber(value: unknown): value is number;

// Expect helpers (throw on invalid)
function expectString(value: unknown, path: string): string;
function expectBoolean(value: unknown, path: string): boolean;
function expectAttachmentPolicy(value: unknown, path: string): AttachmentPolicy;
```

### Error Messages

Validation errors include the full path to the invalid field:

```
config.graph.user_id must be a non-empty string
config.normalize.attachment_policy must be one of: exclude, metadata_only, include_content
config.runtime.polling_interval_ms must be a non-negative finite number
```

---

## Best Practices

### 1. Secrets in Environment

Never commit secrets to config files:

```json
// config.json (safe to commit)
{
  "graph": {
    "user_id": "user@example.com",
    "prefer_immutable_ids": true
  }
}
```

```bash
# secrets.env (gitignored)
export GRAPH_CLIENT_SECRET="actual-secret"
```

### 2. Per-Environment Configs

```
config/
├── development.json
├── staging.json
└── production.json
```

Load based on `NODE_ENV`:
```typescript
const configPath = process.env.CONFIG_PATH || `./config/${process.env.NODE_ENV}.json`;
```

### 3. Immutable IDs

Always enable for production:

```json
{
  "graph": {
    "prefer_immutable_ids": true
  }
}
```

Without immutable IDs, message IDs change when moved between folders, breaking sync continuity.

---

## See Also

- [07-graph-adapter.md](07-graph-adapter.md) — How config is used for Graph authentication
- [08-quickstart.md](08-quickstart.md) — First-time configuration walkthrough
- [09-troubleshooting.md](09-troubleshooting.md) — Configuration-related errors
- [Package AGENTS.md](../AGENTS.md) — Where config files are located
