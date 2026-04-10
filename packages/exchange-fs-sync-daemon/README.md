# exchange-fs-sync-daemon

Long-running polling daemon for continuous mailbox synchronization.

## Overview

This package provides a daemon/service that continuously polls Microsoft Graph for mailbox changes using the core `exchange-fs-sync` library.

## Usage

```bash
# Run the daemon
./dist/index.js

# Or via npm
npm start

# With custom config
CONFIG_PATH=./custom-config.json npm start
```

## Configuration

Uses the same config format as `exchange-fs-sync`. Key runtime settings:

```json
{
  "runtime": {
    "polling_interval_ms": 60000
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONFIG_PATH` | `./config.json` | Path to config file |
| `SHUTDOWN_TIMEOUT_MS` | `30000` | Graceful shutdown timeout |

## Signals

- `SIGINT`, `SIGTERM`: Graceful shutdown
