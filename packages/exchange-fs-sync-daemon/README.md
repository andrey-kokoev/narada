# @narada/exchange-fs-sync-daemon

Long-running daemon for the Narada deterministic state compiler and control plane.

> **How to read this package**: The daemon orchestrates the full kernel pipeline, from source polling through work scheduling to effect execution. The mailbox vertical is currently the most prominent source type, but timer, webhook, filesystem, and process automations are first-class peers.

## Overview

This package provides a daemon/service that continuously polls sources, dispatches `SyncCompletionSignal` to the foreman, schedules work via leases, and executes chartered effects. It is built on the core `exchange-fs-sync` library.

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
