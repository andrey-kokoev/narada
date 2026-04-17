# @narada/exchange-fs-sync

Core library for the Narada deterministic state compiler and control plane.

> **How to read this package**: The kernel is vertical-agnostic. The Exchange/Graph mailbox integration is the *first* vertical built on it, not its defining identity. Timer, webhook, filesystem, and process automations are first-class peers.

## What it does

`exchange-fs-sync` compiles remote source deltas into locally materialized state and durable side-effect intents. It is not a sync client, cache, or email tool. It is a deterministic state compiler with these properties:

- **Replay-safe** — `apply(e)` multiple times produces the same final state.
- **Crash-safe** — Atomic writes and recovery on restart.
- **Idempotent** — Boundaries enforced at `event_id` → `apply_log`.
- **Multi-source** — Merges records from many `Source` instances per scope.
- **Control-plane native** — Emits `SyncCompletionSignal` with `changed_contexts` that the foreman and scheduler turn into governed work.

## Installation

```bash
npm install @narada/exchange-fs-sync
# or
pnpm add @narada/exchange-fs-sync
```

## Usage (Mailbox Vertical)

```typescript
import {
  loadConfig,
  DefaultGraphAdapter,
  DefaultSyncRunner,
  FileCursorStore,
  FileApplyLogStore,
} from '@narada/exchange-fs-sync';

// Load configuration
const config = await loadConfig({ path: './config.json' });

// Create adapter and runner for the mailbox vertical
const adapter = new DefaultGraphAdapter({ /* ... */ });
const runner = new DefaultSyncRunner({
  rootDir: config.root_dir,
  adapter,
  cursorStore: new FileCursorStore({ rootDir, mailboxId }),
  applyLogStore: new FileApplyLogStore({ rootDir }),
  // ... other dependencies
});

// Run sync
const result = await runner.syncOnce();
console.log(`Applied ${result.applied_count} events`);
```

## Features

- **Delta sync** — Efficiently sync only changed records
- **Idempotent** — Safe to re-run, won't duplicate data
- **Crash-safe** — Atomic writes, recovery on restart
- **Normalized** — Consistent record format regardless of source
- **Multi-vertical** — Timer, webhook, filesystem, and process are peers to mailbox

## Documentation

- [00-kernel.md](docs/00-kernel.md) — The canonical kernel lawbook
- [02-architecture.md](docs/02-architecture.md) — Component layers and data flow
- `config.example.json` — Full configuration template

## License

MIT
