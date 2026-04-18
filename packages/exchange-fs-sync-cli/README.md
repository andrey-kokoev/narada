# @narada2/exchange-fs-sync-cli

Command-line interface for the Narada deterministic state compiler and control plane.

> **How to read this package**: The CLI currently surfaces the Exchange/Graph mailbox vertical most prominently because it is the first mature vertical. Under the hood, all commands operate through the same kernel-agnostic `exchange-fs-sync` library, which also supports timer, webhook, filesystem, and process automations as first-class peers.

## Installation

```bash
npm install -g @narada2/exchange-fs-sync-cli
# or
pnpm add -g @narada2/exchange-fs-sync-cli
```

## Quick Start

```bash
# Interactive configuration (recommended)
exchange-sync init --interactive

# Or create config manually
exchange-sync init

# Run sync
exchange-sync sync

# Check status
exchange-sync status

# Create backup
exchange-sync backup -o backup.tar.gz --encrypt
```

## Commands

### `init` - Initialize Configuration

```bash
# Interactive mode with prompts
exchange-sync init --interactive

# Manual configuration
exchange-sync init

# Specify output path
exchange-sync init -o ./my-config.json

# Overwrite existing
exchange-sync init --force
```

Interactive mode will prompt for:
- Scope ID (e.g., mailbox email address)
- Data directory
- Graph API credentials (mailbox vertical)
- Folders to sync
- Test connection before saving

### `sync` - Run Synchronization

```bash
# Single sync cycle
exchange-sync sync

# With config path
exchange-sync sync -c ./config.json

# Dry run (show what would be done)
exchange-sync sync --dry-run

# Verbose output
exchange-sync sync -v
```

### `status` - Show Sync Status

```bash
exchange-sync status

# Verbose (shows counts)
exchange-sync status -v
```

Shows:
- Health status (healthy/stale/error)
- Last sync time
- Message counts
- Storage usage

### `integrity` - Check Data Integrity

```bash
exchange-sync integrity
```

Verifies checksums and consistency of stored data.

### `rebuild-views` - Rebuild Derived Views

```bash
exchange-sync rebuild-views
```

Rebuilds all views (by-thread, unread, flagged, etc.) from source data.

### `backup` - Create Backup

```bash
# Basic backup
exchange-sync backup -o backup.tar.gz

# With encryption
exchange-sync backup -o backup.tar.gz --encrypt

# Include specific components
exchange-sync backup -o backup.tar.gz --include messages,views,config

# Exclude pattern
exchange-sync backup -o backup.tar.gz --exclude-pattern "*.tmp"
```

Options:
- `-o, --output <path>` - Output file path (required)
- `--include <components>` - Comma-separated: messages,views,config,cursor,applyLog,tombstones
- `--exclude-pattern <pattern>` - Exclude files matching pattern
- `--encrypt` - Encrypt backup with passphrase
- `--passphrase <phrase>` - Passphrase for encryption

### `restore` - Restore from Backup

```bash
# Restore all
exchange-sync restore -i backup.tar.gz

# Restore to different directory
exchange-sync restore -i backup.tar.gz -t ./new-data

# Restore specific message
exchange-sync restore -i backup.tar.gz --select msg-123

# Restore messages before date
exchange-sync restore -i backup.tar.gz --before 2024-01-01

# Verify before restore
exchange-sync restore -i backup.tar.gz --verify

# Force overwrite
exchange-sync restore -i backup.tar.gz --force
```

Options:
- `-i, --input <path>` - Backup file path (required)
- `-t, --target-dir <path>` - Override target directory
- `-f, --force` - Overwrite existing files
- `--verify` - Verify checksums before restoring
- `--select <id>` - Restore specific message by ID
- `--before <date>` - Restore only messages before date
- `--passphrase <phrase>` - For encrypted backups

### `backup-verify` - Verify Backup Integrity

```bash
exchange-sync backup-verify -i backup.tar.gz
```

Verifies backup without extracting:
- Archive structure
- Manifest validity
- File checksums
- Encryption (if applicable)

### `backup-ls` - List Backup Contents

```bash
# Basic listing
exchange-sync backup-ls -i backup.tar.gz

# Detailed listing
exchange-sync backup-ls -i backup.tar.gz --detailed
```

## Global Options

All commands support these global options:

```bash
-f, --format <format>       Output format: json, human, or auto (default: auto)
-v, --verbose               Enable verbose output
-c, --config <path>         Config file path (default: ./config.json)
--log-level <level>         Log level: debug, info, warn, error (default: info)
--log-format <format>       Log format: pretty, json, or auto (default: auto)
--metrics-output <file>     Write metrics to file on exit
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GRAPH_TENANT_ID` | Azure AD tenant ID |
| `GRAPH_CLIENT_ID` | Azure AD application client ID |
| `GRAPH_CLIENT_SECRET` | Azure AD application client secret |
| `GRAPH_ACCESS_TOKEN` | Direct access token (alternative to credentials) |

## Configuration

See [06-configuration.md](../exchange-fs-sync/docs/06-configuration.md) for full configuration reference.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Configuration error |
| 4 | Authentication error |
| 5 | Sync error |
| 6 | Integrity check failed |

## Examples

### Daily Backup Script

```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
exchange-sync backup -o "/backups/exchange-${DATE}.tar.gz" --encrypt --passphrase "$(cat /secure/passphrase.txt)"
```

### Health Check Alert

```bash
#!/bin/bash
if ! exchange-sync status -f json | jq -e '.health == "healthy"' > /dev/null; then
  echo "Sync health check failed" | mail -s "Alert" admin@example.com
fi
```

## License

MIT
