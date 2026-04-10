# Agent G Assignment: Cleanup & Compaction

## Mission
Implement data lifecycle management: tombstone cleanup, compaction, and retention policies.

## Scope
`packages/exchange-fs-sync/` - Data lifecycle

## Deliverables

### 1. Tombstone Cleanup

```typescript
// src/lifecycle/cleanup.ts
export interface CleanupOptions {
  maxTombstoneAgeDays: number;  // default: 30
  dryRun: boolean;              // preview changes
}

export interface CleanupResult {
  tombstonesRemoved: number;
  bytesReclaimed: number;
  errors: Array<{ path: string; error: Error }>;
}

export async function cleanupTombstones(
  store: TombstoneStore,
  options: CleanupOptions
): Promise<CleanupResult>;
```

Behavior:
- Remove tombstones older than `maxTombstoneAgeDays`
- Don't remove if message still exists (safety check)
- Log each removal

### 2. Message Archive/Compaction

```typescript
// src/lifecycle/compaction.ts
export interface CompactionOptions {
  archiveAfterDays: number;     // move old messages to archive
  archiveDir: string;           // separate location
  compress: boolean;            // gzip archived messages
}

export interface CompactionResult {
  messagesArchived: number;
  messagesDeleted: number;
  bytesBefore: number;
  bytesAfter: number;
}

export async function compactMessages(
  messageStore: MessageStore,
  viewStore: ViewStore,
  options: CompactionOptions
): Promise<CompactionResult>;
```

Behavior:
- Messages older than `archiveAfterDays` → archive dir
- Optional gzip compression
- Update views to point to archive location
- Keep tombstones (for sync continuity)

### 3. Vacuum Operation

```typescript
// src/lifecycle/vacuum.ts
export interface VacuumOptions {
  rebuildViews: boolean;
  verifyChecksums: boolean;
  removeOrphans: boolean;
}

export async function vacuum(
  config: Config,
  options: VacuumOptions
): Promise<{
  issuesFound: number;
  issuesFixed: number;
  viewsRebuilt: boolean;
}>;
```

Checks:
- Orphaned message files (no view entry)
- Missing message files (view entry exists)
- Corrupted JSON (unreadable files)
- Stale tombstones (message gone, tombstone remains)

### 4. Retention Policy

```typescript
// src/lifecycle/retention.ts
export interface RetentionPolicy {
  maxAgeDays?: number;          // delete messages older than N days
  maxTotalSize?: string;        // "10GB" - oldest first
  maxMessageCount?: number;     // keep only N most recent
  preserveFlagged: boolean;     // don't delete flagged items
  preserveUnread: boolean;      // don't delete unread
}

export async function applyRetentionPolicy(
  messageStore: MessageStore,
  viewStore: ViewStore,
  policy: RetentionPolicy
): Promise<{
  messagesDeleted: number;
  bytesFreed: number;
  preserved: number;  // count of skipped due to flags
}>;
```

### 5. Scheduled Cleanup

```typescript
// src/lifecycle/scheduler.ts
export interface CleanupSchedule {
  frequency: 'daily' | 'weekly' | 'on-sync';
  maxRunTimeMinutes: number;
  timeWindow?: { start: string; end: string }; // "02:00" - "04:00"
}

export async function maybeRunCleanup(
  config: Config,
  schedule: CleanupSchedule,
  lastRun: Date | null
): Promise<boolean>;  // true if ran
```

### 6. CLI Commands

```typescript
// CLI additions
cleanup
  --dry-run          # Preview what would be cleaned
  --tombstones       # Clean tombstones only
  --compact          # Archive old messages
  --vacuum           # Full integrity check
  --retention        # Apply retention policy
  --all              # Do all cleanup types
```

## Config Integration

```json
{
  "lifecycle": {
    "tombstone_retention_days": 30,
    "archive_after_days": 90,
    "retention": {
      "max_age_days": 365,
      "max_total_size": "50GB",
      "preserve_flagged": true
    },
    "cleanup_schedule": {
      "frequency": "weekly",
      "time_window": { "start": "02:00", "end": "04:00" }
    }
  }
}
```

## Definition of Done

- [ ] Tombstone cleanup removes old entries
- [ ] Compaction archives old messages with optional compression
- [ ] Vacuum detects and fixes inconsistencies
- [ ] Retention policy respects flags/unread
- [ ] Dry-run mode previews changes
- [ ] CLI commands for all operations
- [ ] Scheduled cleanup runs in time window
- [ ] Cleanup is interruptible (respects shutdown)

## Dependencies
- Agent E's config validation (for lifecycle config schema)
- Agent B's mock adapter (for testing with many messages)

## Time Estimate
3 hours
