# @narada2/cli

Command-line interface for the Narada deterministic state compiler and control plane.

> **How to read this package**: The CLI currently surfaces the Exchange/Graph mailbox vertical most prominently because it is the first mature vertical. Under the hood, all commands operate through the same kernel-agnostic `@narada2/control-plane` library, which also supports timer, webhook, filesystem, and process automations as first-class peers.

## Installation

```bash
npm install -g @narada2/cli
# or
pnpm add -g @narada2/cli
```

## Quick Start

```bash
# Interactive configuration (recommended)
narada init --interactive

# Or create config manually
narada init

# Run sync
narada sync

# Check status
narada status

# Create backup
narada backup -o backup.tar.gz --encrypt
```

## Commands

### `init` - Initialize Configuration

```bash
# Interactive mode with prompts
narada init --interactive

# Manual configuration
narada init

# Specify output path
narada init -o ./my-config.json

# Overwrite existing
narada init --force
```

Interactive mode will prompt for:
- Operation (e.g., mailbox email address)
- Data directory
- Graph API credentials (mailbox vertical)
- Folders to sync
- Test connection before saving

### `sync` - Run Synchronization

```bash
# Single sync cycle
narada sync

# With config path
narada sync -c ./config.json

# Dry run (show what would be done)
narada sync --dry-run

# Verbose output
narada sync -v
```

### `status` - Show Sync Status

```bash
narada status

# Verbose (shows counts)
narada status -v
```

Shows:
- Health status (healthy/stale/error)
- Last sync time
- Message counts
- Storage usage

### `integrity` - Check Data Integrity

```bash
narada integrity
```

Verifies checksums and consistency of stored data.

### `rebuild-views` - Rebuild Derived Views

```bash
narada rebuild-views
```

Rebuilds all views (by-thread, unread, flagged, etc.) from source data.

### `backup` - Create Backup

```bash
# Basic backup
narada backup -o backup.tar.gz

# With encryption
narada backup -o backup.tar.gz --encrypt

# Include specific components
narada backup -o backup.tar.gz --include messages,views,config

# Exclude pattern
narada backup -o backup.tar.gz --exclude-pattern "*.tmp"
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
narada restore -i backup.tar.gz

# Restore to different directory
narada restore -i backup.tar.gz -t ./new-data

# Restore specific message
narada restore -i backup.tar.gz --select msg-123

# Restore messages before date
narada restore -i backup.tar.gz --before 2024-01-01

# Verify before restore
narada restore -i backup.tar.gz --verify

# Force overwrite
narada restore -i backup.tar.gz --force
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
narada backup-verify -i backup.tar.gz
```

Verifies backup without extracting:
- Archive structure
- Manifest validity
- File checksums
- Encryption (if applicable)

### `backup-ls` - List Backup Contents

```bash
# Basic listing
narada backup-ls -i backup.tar.gz

# Detailed listing
narada backup-ls -i backup.tar.gz --detailed
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

See [06-configuration.md](../control-plane/docs/06-configuration.md) for full configuration reference.

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
narada backup -o "/backups/narada-${DATE}.tar.gz" --encrypt --passphrase "$(cat /secure/passphrase.txt)"
```

### Health Check Alert

```bash
#!/bin/bash
if ! narada status -f json | jq -e '.health == "healthy"' > /dev/null; then
  echo "Sync health check failed" | mail -s "Alert" admin@example.com
fi
```

## License

MIT
