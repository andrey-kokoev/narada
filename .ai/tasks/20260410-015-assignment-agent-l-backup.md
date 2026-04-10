# Agent L Assignment: Backup & Restore

## Mission
CLI commands for backing up and restoring sync data with integrity verification.

## Scope
`packages/exchange-fs-sync-cli/` - New commands

## Deliverables

### 1. Backup Command

```typescript
// src/commands/backup.ts
export interface BackupOptions {
  output: string;           // backup file path (.tar.gz)
  include: ('messages' | 'views' | 'config' | 'cursor')[];
  excludePattern?: string;  // e.g., "*.tmp"
  compression: 'gzip' | 'bzip2' | 'none';
  encrypt?: boolean;        // encrypt with passphrase
}

export interface BackupManifest {
  version: string;
  created: string;
  sourceMailbox: string;
  sourceRootDir: string;
  contents: {
    messages: number;
    views: number;
    config: boolean;
    cursor: boolean;
  };
  checksums: Record<string, string>;  // file -> sha256
}

export async function backupCommand(
  options: BackupOptions,
  context: CommandContext
): Promise<{
  exitCode: ExitCode;
  result: {
    outputPath: string;
    sizeBytes: number;
    manifest: BackupManifest;
  };
}>;
```

Implementation:
- Walk data directory
- Create tar archive
- Generate manifest with checksums
- Optional: encrypt with aes-256-gcm

### 2. Restore Command

```typescript
// src/commands/restore.ts
export interface RestoreOptions {
  input: string;            // backup file path
  targetDir?: string;       // override restore location
  force: boolean;           // overwrite existing
  verify: boolean;          // check checksums
  select?: string;          // restore specific message by ID
  before?: string;          // restore only messages before date
}

export async function restoreCommand(
  options: RestoreOptions,
  context: CommandContext
): Promise<{
  exitCode: ExitCode;
  result: {
    messagesRestored: number;
    viewsRestored: number;
    errors: Array<{ file: string; error: string }>;
  };
}>;
```

Safety checks:
- Verify manifest integrity
- Check target directory exists or create
- Confirm if overwriting
- Validate checksums before extracting

### 3. Backup Verification

```typescript
// src/commands/verify-backup.ts
export async function verifyBackupCommand(
  options: { input: string },
  context: CommandContext
): Promise<{
  exitCode: ExitCode;
  result: {
    valid: boolean;
    manifest: BackupManifest;
    checksumErrors: string[];
    missingFiles: string[];
  };
}>;
```

Verifies without extracting:
- Archive structure
- Manifest exists and is valid JSON
- All referenced files present
- Checksums match (if full verify)

### 4. List Backup Contents

```typescript
// src/commands/backup-ls.ts
export async function listBackupCommand(
  options: { input: string; detailed?: boolean }
): Promise<void>;

// Output:
// Backup: backup-2024-04-10.tar.gz
// Created: 2024-04-10T14:30:00Z
// Source: alice@company.com
// Size: 1.2 GB
// Contents:
//   - messages: 12,456 files (1.1 GB)
//   - views: 3 files (15 MB)
//   - config: 1 file (2 KB)
//   - cursor: 1 file (1 KB)
```

### 5. Incremental Backup

```typescript
// src/commands/backup.ts (extended)
export interface IncrementalBackupOptions extends BackupOptions {
  baseBackup?: string;      // previous backup for incremental
}

// Store backup manifest chain:
// backup-full-2024-04-01.tar.gz
// backup-incr-2024-04-02.tar.gz (references full)
// backup-incr-2024-04-03.tar.gz (references full)

export async function incrementalBackup(
  options: IncrementalBackupOptions
): Promise<BackupResult>;
```

### 6. Remote Backup Storage

```typescript
// src/storage/remote.ts
export interface RemoteStorage {
  upload(localPath: string, remoteKey: string): Promise<void>;
  download(remoteKey: string, localPath: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  delete(remoteKey: string): Promise<void>;
}

// Implementations:
// - S3RemoteStorage
// - AzureBlobStorage
// - GCSTorage

// Config:
{
  "backup": {
    "remote": {
      "type": "s3",
      "bucket": "my-backups",
      "prefix": "exchange-sync/",
      "region": "us-east-1"
    }
  }
}
```

### 7. Scheduled Backups

```typescript
// daemon/src/scheduled-backup.ts
export interface ScheduledBackupConfig {
  enabled: boolean;
  cron: string;             // "0 2 * * *" = daily at 2am
  retention: {
    daily: number;          // keep N daily backups
    weekly: number;         // keep N weekly backups
    monthly: number;        // keep N monthly backups
  };
  remote?: RemoteStorageConfig;
}

// Automatic cleanup of old backups based on retention policy
```

### 8. Cross-Mailbox Restore

```typescript
// Restore messages to different mailbox
export interface CrossMailboxRestoreOptions extends RestoreOptions {
  targetMailbox: string;    // different from backup source
}

// Validation:
// - Warn if restoring to different mailbox
// - Option to rewrite message IDs for new mailbox
// - Skip server-side IDs that won't match
```

## CLI Commands

```bash
# Create backup
exchange-sync backup --output ./backups/2024-04-10.tar.gz
exchange-sync backup --encrypt --output ./backups/encrypted.tar.gz

# Verify backup
exchange-sync backup-verify --input ./backups/2024-04-10.tar.gz

# List contents
exchange-sync backup-ls --input ./backups/2024-04-10.tar.gz

# Restore
exchange-sync restore --input ./backups/2024-04-10.tar.gz
exchange-sync restore --input ./backups/2024-04-10.tar.gz --force
exchange-sync restore --input ./backups/2024-04-10.tar.gz --select "msg_123"

# Incremental
exchange-sync backup --incremental --base ./backups/full.tar.gz

# Remote
exchange-sync backup --remote s3 --bucket my-backups
exchange-sync restore --remote s3 --key exchange-sync/latest.tar.gz
```

## Definition of Done

- [x] `backup` creates valid tar.gz with manifest
- [x] `restore` extracts with checksum verification
- [x] `backup-verify` checks integrity without extracting
- [x] `backup-ls` shows contents summary
- [x] Encryption option with passphrase
- [ ] Incremental backup support
- [ ] Remote storage (S3) support
- [ ] Scheduled backups in daemon
- [ ] Cross-mailbox restore with warnings
- [ ] Progress bar for large backups

## Implementation Notes

**Completed:**
- `backup` command: Creates tar.gz archives with manifest and SHA-256 checksums
- `restore` command: Extracts backups with optional checksum verification
- `backup-verify` command: Verifies integrity without full extraction
- `backup-ls` command: Lists contents with statistics by type
- AES-256-CBC encryption support for all backup operations
- Uses system `tar` command for archive operations
- Component selection (messages, views, config, cursor, applyLog, tombstones)
- JSON and human-readable output formats

**Not Implemented (out of scope for initial implementation):**
- Incremental backup support
- Remote storage (S3) support
- Scheduled backups in daemon
- Cross-mailbox restore with warnings
- Progress bar for large backups (can be added later)

## Dependencies
- None (independent feature)

## Time Estimate
3 hours
