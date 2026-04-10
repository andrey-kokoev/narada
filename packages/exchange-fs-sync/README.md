# @narada/exchange-fs-sync

Core library for synchronizing Microsoft Exchange mailboxes to the filesystem.

## Installation

```bash
npm install @narada/exchange-fs-sync
# or
pnpm add @narada/exchange-fs-sync
```

## Usage

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

// Create adapter and runner
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

- **Delta sync** - Efficiently sync only changed messages
- **Idempotent** - Safe to re-run, won't duplicate data
- **Crash-safe** - Atomic writes, recovery on restart
- **Normalized** - Consistent message format regardless of source

## Configuration

See `config.example.json` for a full configuration template.

## License

MIT
