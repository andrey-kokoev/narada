# Persistence Layer

## Overview

The persistence layer provides durable storage using the local filesystem. All mutations are atomic through the write-to-temp-then-rename pattern. The layer is designed for crash recovery and idempotent operations.

---

## Directory Layout

```
{root_dir}/
├── state/                       # Authoritative state
│   ├── cursor.json             # Committed delta token
│   ├── apply-log/              # Event idempotency markers
│   │   └── {shard}/            # First 2 chars of event_id
│   │       └── {event_id}.json
│   └── {lockname}/             # Lock directory (e.g., sync.lock/)
│       └── meta.json
├── messages/                    # Canonical message state
│   └── {message_id}/           # URL-encoded message ID
│       ├── record.json         # Normalized payload
│       ├── body/
│       │   ├── body.txt        # Text content (optional)
│       │   └── body.html       # HTML content (optional)
│       └── attachments/
│           ├── manifest.json
│           ├── by-id/          # Content-addressed blobs
│           └── by-name/        # Human-readable symlinks
├── tombstones/                  # Deletion markers (optional)
│   └── {message_id}.json
├── views/                       # Derived projections
│   ├── by-thread/{conv_id}/members/{msg_id} -> ../../../../../messages/{msg_id}
│   ├── by-folder/{folder_id}/members/{msg_id} -> ../../../../../messages/{msg_id}
│   ├── unread/{msg_id} -> ../../../messages/{msg_id}
│   ├── flagged/{msg_id} -> ../../../messages/{msg_id}
│   └── _meta.json
├── blobs/                       # Content-addressed storage
│   └── sha256/
│       └── {aa}/{bb}/{hash}    # 4-char prefix sharding
└── tmp/                         # Atomic write staging
    └── {staging-files}.tmp
```

---

## Atomic Write Pattern

All file mutations follow this pattern:

```typescript
async function atomicWrite(
  tmpDir: string,
  finalPath: string,
  data: string | Uint8Array,
): Promise<void> {
  // 1. Ensure parent directory exists
  await mkdir(dirname(finalPath), { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  // 2. Generate unique temp path
  const tmpPath = join(
    tmpDir,
    `file.${process.pid}.${Date.now()}.tmp`
  );

  // 3. Write to temp location
  await writeFile(tmpPath, data);

  // 4. Atomic rename to final location
  try {
    await rename(tmpPath, finalPath);
  } catch (error) {
    // 5. Cleanup on failure
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
```

### Properties

- **Atomicity**: `rename()` is atomic on all POSIX systems and Windows
- **Crash Safety**: Temp files left after crash are cleaned up on next startup
- **Concurrency**: Single-writer lock prevents concurrent modifications

---

## Store Implementations

### 1. FileCursorStore (`cursor.ts`)

Stores the committed delta token for resuming sync.

```typescript
interface CursorFileShape {
  mailbox_id: string;
  committed_cursor: string;
  committed_at: string;
}
```

**Commit Process**:
1. Read prior cursor (optional)
2. Fetch and process events
3. Write new cursor to temp file
4. Atomic rename to `state/cursor.json`

**Validation**:
- `mailbox_id` must match configured mailbox
- `committed_cursor` must be non-empty string
- File shape validated on read

---

### 2. FileApplyLogStore (`apply-log.ts`)

Tracks applied events for idempotency.

```typescript
interface ApplyMarkerFileShape {
  event_id: string;
  message_id: string;
  event_kind: "upsert" | "delete";
  applied_at: string;
}
```

**Sharding**:
- Events sharded by first 2 characters of `event_id`
- Path: `state/apply-log/{shard}/{event_id}.json`
- Prevents directories with too many entries

**Duplicate Detection**:
```typescript
async markApplied(event: NormalizedEvent): Promise<void> {
  // Check if marker already exists
  try {
    const existing = await readFile(markerPath, "utf8");
    validateApplyMarkerShape(JSON.parse(existing));
    return; // Already applied, silently succeed
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  // ... write marker
}
```

---

### 3. FileMessageStore (`messages.ts`)

Stores canonical message state with atomic replacement.

**Directory Structure per Message**:
```
messages/{encoded_message_id}/
├── record.json          # Full normalized payload
├── body/
│   ├── body.txt        # Plain text (if available)
│   └── body.html       # HTML content (if available)
└── attachments/
    ├── manifest.json   # Attachment metadata
    ├── by-id/          # Content-addressed files
    └── by-name/        # Named symlinks
```

**Upsert Algorithm**:
```
1. Create staging directory in tmp/
2. Write all files to staging
3. If destination exists:
   a. Rename destination to {dest}.prior.{pid}.{timestamp}
   b. Rename staging to destination
   c. Remove prior directory
4. If destination doesn't exist:
   a. Rename staging to destination
5. On error: attempt rollback
```

This ensures readers always see a complete message state, never a partial write.

---

### 4. FileTombstoneStore (`tombstones.ts`)

Optional deletion markers for audit trails.

```typescript
interface TombstoneShape {
  message_id: string;
  mailbox_id: string;
  deleted_by_event_id: string;
  source_version?: string;
  observed_at: string;
}
```

**Usage**:
- Written on delete events (if `tombstones_enabled: true`)
- Removed on upsert (message restored)
- Enables point-in-time recovery analysis

---

### 5. FileViewStore (`views.ts`)

Derived projections using symlinks.

**View Types**:

| View | Path | Link Target |
|------|------|-------------|
| by-thread | `views/by-thread/{conv_id}/members/{msg_id}` | `../../../messages/{msg_id}` |
| by-folder | `views/by-folder/{folder_id}/members/{msg_id}` | `../../../../../messages/{msg_id}` |
| unread | `views/unread/{msg_id}` | `../../../messages/{msg_id}` |
| flagged | `views/flagged/{msg_id}` | `../../../messages/{msg_id}` |

**Update Strategy**:
- During event apply: create/update symlinks
- On delete: remove symlinks
- Full rebuild: delete `views/` directory, recreate from `messages/`

**Symlink Calculation**:
```typescript
const target = relative(
  join(linkPath, ".."),  // View directory
  messageDir             // Messages directory
);
await symlink(target, linkPath, "dir");
```

---

### 6. FileBlobStore (`blobs.ts`)

Content-addressed storage for attachments.

**Addressing**:
```
blobs/sha256/{aa}/{bb}/{64-char-hash}
```

Where `aa` = first 2 chars, `bb` = next 2 chars of hash.

**Deduplication**:
```typescript
async installBytes(bytes: Uint8Array): Promise<string> {
  const hash = sha256HexBytes(bytes);
  const destination = this.blobPath(hash);

  // Fast path: already exists
  if (await this.exists(destination)) {
    return `blob:sha256:${hash}`;
  }

  // Slow path: write and rename
  // ...
}
```

**Content References**:
- Inline: `inline-base64:{base64data}` (temporary)
- Stored: `blob:sha256:{hash}` (permanent)

---

### 7. FileLock (`lock.ts`)

Directory-based exclusive lock.

**Algorithm**:
```
acquire():
  while true:
    try:
      mkdir(lockDir)  // Atomic create-if-not-exists
      writeMeta()     // Record pid and timestamp
      return releaseFn
    catch EEXIST:
      if isStale():
        rm(lockDir)   // Stale lock cleanup
        continue
      if timeout:
        throw Error
      sleep(retryDelay)
```

**Stale Detection**:
- Default stale threshold: 5 minutes
- Based on directory mtime
- Allows recovery from crashed processes

---

## Crash Recovery

### CleanupTmp (`recovery/cleanup-tmp.ts`)

Removes stale temporary files on startup:

```typescript
async function cleanupTmp(opts: { rootDir: string; maxAgeMs?: number }): Promise<void> {
  const entries = await readdir(tmpDir);
  
  for (const name of entries) {
    const stat = await stat(join(tmpDir, name));
    const age = Date.now() - stat.mtimeMs;
    
    if (age > maxAgeMs) {  // default: 24 hours
      await rm(path, { recursive: true, force: true });
    }
  }
}
```

### Recovery Scenarios

| Crash Point | State | Recovery Behavior |
|-------------|-------|-------------------|
| Before apply | event not applied, not in apply_log | Will be applied on replay |
| After apply, before mark_applied | event applied, not in apply_log | Reapplied (idempotent) |
| After mark_applied, before cursor | event in apply_log, cursor not updated | Skipped on replay |
| After cursor commit | All durable | Normal operation |

---

## Performance Considerations

### Apply-Log Sharding

- 2-character hex prefix = 256 shards
- Even distribution of event IDs
- Prevents directories with millions of files

### Blob Sharding

- 4-character prefix = 65,536 shards
- SHA256 provides uniform distribution
- Each shard holds ~1/65k of total blobs

### Symlink-Based Views

- O(1) lookup by thread/folder
- No index rebuilding on read
- Trade space for query speed

### Caching Opportunities

The current implementation is intentionally cache-free. Potential additions:
- In-memory apply_log cache (LRU of recent events)
- Cursor read caching (single value, invalidate on commit)
- Blob existence cache (bloom filter for negative lookups)

---

## See Also

- [02-architecture.md](02-architecture.md) — Where persistence fits in the component model
- [04-identity.md](04-identity.md) — Event IDs and content hashing
- [09-troubleshooting.md](09-troubleshooting.md) — Debugging persistence issues
- [Package AGENTS.md](../AGENTS.md) — Debugging tips and common pitfalls
