# Agent H Assignment: Multi-Mailbox Support

## Mission
Support syncing multiple mailboxes in parallel with resource management.

## Scope
`packages/exchange-fs-sync/` - Core runner changes

## Deliverables

### 1. Multi-Mailbox Config

```typescript
// src/config/multi-mailbox.ts
export interface MailboxConfig {
  id: string;                   // unique identifier
  mailbox_id: string;           // email address / graph ID
  root_dir: string;
  graph: GraphCredentials;
  sync?: SyncOptions;
}

export interface MultiMailboxConfig {
  mailboxes: MailboxConfig[];
  shared?: {
    token_provider?: TokenProviderConfig;
  };
  global?: {
    max_concurrent_syncs: number;  // default: 2
    resource_limits: ResourceLimits;
  };
}

export interface ResourceLimits {
  maxMemoryMB: number;          // per-sync memory limit
  maxDiskIOPerSecond: number;
  maxNetworkRequestsPerSecond: number;
}
```

### 2. Parallel Sync Runner

```typescript
// src/runner/multi-sync.ts
export interface MultiSyncOptions {
  mailboxIds?: string[];        // specific mailboxes, or all
  continueOnError: boolean;     // don't stop on one failure
}

export interface MailboxSyncResult {
  mailboxId: string;
  success: boolean;
  durationMs: number;
  messagesSynced: number;
  error?: Error;
}

export async function syncMultiple(
  config: MultiMailboxConfig,
  options: MultiSyncOptions
): Promise<{
  results: MailboxSyncResult[];
  totalDurationMs: number;
  successes: number;
  failures: number;
}>;
```

Concurrency control:
- Use p-limit or similar for `max_concurrent_syncs`
- Each sync runs in isolation (separate stores)
- Shared token provider if configured

### 3. Resource Management

```typescript
// src/utils/resources.ts
export class ResourceManager {
  private memoryLimitMB: number;
  private activeSyncs: Map<string, ResourceUsage>;

  canStartSync(mailboxId: string): boolean;
  trackSync(mailboxId: string, usage: ResourceUsage): void;
  endSync(mailboxId: string): void;
  getThrottlingDelay(): number;  // slow down if resources tight
}

export interface ResourceUsage {
  memoryMB: number;
  diskIOps: number;
  networkRequestsPerSec: number;
}
```

### 4. Per-Mailbox Health

```typescript
// src/health-multi.ts
export interface MultiMailboxHealth {
  global: GlobalHealthMetrics;
  mailboxes: Map<string, MailboxHealth>;
}

export interface MailboxHealth {
  lastSync: Date | null;
  lastSuccess: Date | null;
  consecutiveFailures: number;
  messagesTotal: number;
  status: 'healthy' | 'stale' | 'error' | 'syncing';
}

export async function writeMultiMailboxHealth(
  config: MultiMailboxConfig,
  results: MailboxSyncResult[]
): Promise<void>;
```

### 5. Shared Token Provider

```typescript
// src/adapter/graph/shared-token.ts
export class SharedTokenProvider implements TokenProvider {
  private cache: Map<string, Token>;  // by credential key
  private refreshPromises: Map<string, Promise<Token>>;

  async getToken(credentials: GraphCredentials): Promise<Token>;
  // Deduplicates concurrent refresh requests
  // Shares token across mailboxes with same credentials
}
```

### 6. CLI Updates

```typescript
// CLI additions
sync
  --mailbox <id>       # Sync specific mailbox only
  --all                # Sync all (default if multi-config)
  --parallel <n>       # Override concurrency

status
  --mailbox <id>       # Status for specific mailbox
  # Shows table of all mailboxes if multi-config

init
  --add-to-existing    # Add another mailbox to config
```

Status table output:

```
┌──────────────────┬─────────┬─────────────┬─────────┬──────────┐
│ Mailbox          │ Status  │ Last Sync   │ Messages│ Failures │
├──────────────────┼─────────┼─────────────┼─────────┼──────────┤
│ alice@company.com│ healthy │ 2 min ago   │ 1,234   │ 0        │
│ bob@company.com  │ stale   │ 2 hours ago │ 5,678   │ 0        │
│ shared@company.com│ error  │ 1 day ago   │ 45,210  │ 5        │
└──────────────────┴─────────┴─────────────┴─────────┴──────────┘
```

## Directory Structure

```
{root_dir}/
├── alice@company.com/
│   ├── .config.json
│   ├── .cursor.json
│   ├── data/
│   └── .health.json
├── bob@company.com/
│   ├── .config.json
│   └── ...
└── .multi-health.json   # aggregate health
```

Or flat structure with subdirs:

```
{root_dir}/
├── config.json          # multi-mailbox config
├── alice_company_com/
│   ├── cursor.json
│   └── data/
└── bob_company_com/
    └── ...
```

## Definition of Done

- [ ] Multi-mailbox config validates all entries
- [ ] Parallel sync respects concurrency limits
- [ ] Resource manager prevents overload
- [ ] Per-mailbox health tracked
- [ ] Shared token provider dedupes refresh
- [ ] CLI shows multi-mailbox status table
- [ ] Can add mailbox to existing config
- [ ] One mailbox failure doesn't stop others
- [ ] Graceful shutdown waits for all syncs

## Dependencies
- Agent F's batch processing (for resource management)
- Agent E's config validation (for multi-mailbox schema)
- Agent D's observability (for per-mailbox metrics)

## Time Estimate
4 hours
