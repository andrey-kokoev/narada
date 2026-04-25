# Assignment: Agent B - Core Infrastructure Expert

**Role:** Core Package / Testing Infrastructure  
**Scope:** `packages/exchange-fs-sync/`  
**Parallel to:** Agent A (CLI Polish)

---

## Task 1: Core Exports Audit (Priority: High)

### Goal
Ensure daemon package can import everything it needs from core.

### Current State
Daemon imports from `exchange-fs-sync` - may be missing some exports.

### Investigation
Check `packages/exchange-fs-sync-daemon/src/service.ts` imports:
```typescript
import {
  loadConfig,
  buildGraphTokenProvider,
  GraphHttpClient,
  DefaultGraphAdapter,
  DefaultSyncRunner,
  FileCursorStore,
  FileApplyLogStore,
  FileMessageStore,
  FileTombstoneStore,
  FileViewStore,
  FileBlobStore,
  FileLock,
  applyEvent,
  cleanupTmp,
  normalizeFolderRef,
  normalizeFlagged,
} from 'exchange-fs-sync';
import type { ExchangeFsSyncConfig } from 'exchange-fs-sync';
```

### Verification Steps
1. Check `packages/exchange-fs-sync/src/index.ts` exports
2. Verify all daemon imports are exported
3. Check if any types are missing
4. Add any missing exports

### Likely Missing
- `ExchangeFsSyncConfig` type (config types)
- Individual store options types
- Progress types (already added by chief)

### Files to Modify
- `packages/exchange-fs-sync/src/index.ts` (+ exports)
- `packages/exchange-fs-sync/src/config/index.ts` (if exists, ensure types exported)

---

## Task 2: Mock Graph Adapter (Priority: High)

### Goal
Enable development/testing without real Microsoft Graph credentials.

### Why
- New developers can run sync immediately
- CI tests don't need secrets
- Faster iteration

### Implementation

Create `src/adapter/graph/mock-adapter.ts`:

```typescript
export interface MockAdapterOptions {
  messageCount?: number;
  delayMs?: number;
  failureRate?: number; // 0-1 probability of error
}

export class MockGraphAdapter implements GraphAdapter {
  private options: MockAdapterOptions;
  private messages: GraphDeltaMessage[];
  
  constructor(options: MockAdapterOptions = {}) {
    this.options = {
      messageCount: 10,
      delayMs: 100,
      failureRate: 0,
      ...options
    };
    this.messages = this.generateMessages();
  }
  
  async fetch_since(cursor?: string | null): Promise<NormalizedBatch> {
    // Simulate network delay
    await setTimeout(this.options.delayMs);
    
    // Simulate failures
    if (Math.random() < this.options.failureRate) {
      throw new Error('Mock network error');
    }
    
    // Return normalized batch
    return {
      events: this.messages.map(m => this.normalizeMessage(m)),
      has_more: false,
      // ...etc
    };
  }
  
  private generateMessages(): GraphDeltaMessage[] {
    // Generate realistic fake messages
    return Array.from({ length: this.options.messageCount }, (_, i) => ({
      id: `mock-msg-${i}`,
      subject: `Test Message ${i}`,
      // ...etc
    }));
  }
}
```

### Features
- Configurable message count
- Simulated network delay
- Optional failure injection (for error testing)
- Realistic message data

### Files to Create
- `src/adapter/graph/mock-adapter.ts`
- `src/adapter/graph/fixtures/` (sample data if needed)

### Files to Modify
- `src/index.ts` (export MockGraphAdapter)
- `src/adapter/graph/index.ts` (if exists, re-export)

---

## Task 3: Health File Writer (Priority: Low)

### Goal
Write `.health.json` after each sync for external monitoring.

### Why
- Daemon/external tools can check health without parsing logs
- Simple file-based health check

### Implementation

Create `src/health.ts`:

```typescript
export interface HealthStatus {
  timestamp: string;
  status: 'healthy' | 'stale' | 'error';
  mailboxId: string;
  lastSyncAt: string | null;
  messageCount: number;
  error?: string;
}

export async function writeHealthFile(
  rootDir: string,
  status: HealthStatus
): Promise<void> {
  const healthPath = join(rootDir, '.health.json');
  await writeFile(healthPath, JSON.stringify(status, null, 2));
}
```

### Integration
Call from sync runner on completion/error.

### Files to Create
- `src/health.ts`

### Files to Modify
- `src/runner/sync-once.ts` (call writeHealthFile)

---

## Deliverables Checklist

- [x] Core package exports verified against daemon imports
- [x] Missing exports added to `src/index.ts`
- [x] Mock adapter builds: `npm run build`
- [x] Mock adapter can be used in place of real adapter
- [x] Health file writes after sync
- [x] No conflicts with Agent A's work

---

## Handoff Notes for Chief Agent

- Mock adapter should implement same interface as DefaultGraphAdapter
- Consider: should mock be in separate package for reuse in tests?
- Health file format should be documented for external tools
