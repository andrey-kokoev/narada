# Agent F Assignment: Security Hardening & Performance

## Mission
Secure credential storage and implement memory-efficient batch processing.

## Scope
`packages/exchange-fs-sync/` - Core security & performance

## Deliverables

### 1. Credential Encryption ✅

Created `src/auth/secure-storage.ts`:

```typescript
export interface SecureStorage {
  getCredential(key: string): Promise<string | null>;
  setCredential(key: string, value: string): Promise<void>;
  deleteCredential(key: string): Promise<void>;
  hasCredential(key: string): Promise<boolean>;
}
```

Implementations:
- `KeychainStorage` - Uses keytar for OS keychain integration
- `FileSecureStorage` - AES-256-GCM encrypted file fallback
- `InMemorySecureStorage` - For testing

Updated config loading in `src/config/load.ts` and `src/config/secure-config.ts`:
- Supports `{ "$secure": "key" }` references in config
- Automatic resolution of secure values from storage

Config format example:
```json
{
  "graph": {
    "client_secret": { "$secure": "client_secret" },
    "client_id": "plaintext-ok"
  }
}
```

### 2. Secure Temp Files ✅

Created `src/utils/temp.ts`:

```typescript
export async function withSecureTemp<T>(
  fn: (dir: string) => Promise<T>
): Promise<T>

export async function createSecureTempDir(
  options?: SecureTempOptions
): Promise<string>

export async function writeFileSecurely(
  finalPath: string,
  data: string | Buffer
): Promise<void>
```

Features:
- Temp directories created with 0700 permissions (owner only)
- Atomic file writes (temp + rename)
- Auto-cleanup on process exit
- Secure random filename generation

### 3. Log Sanitization ✅

Created `src/logging/sanitize.ts`:

```typescript
export function sanitizeForLogging(obj: unknown): unknown
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string>
export function sanitizeUrl(url: string): string
export function redactEmail(email: string): string
export function isSensitiveField(key: string): boolean
```

Sensitive fields redacted:
- client_secret, access_token, refresh_token
- password, authorization, api_key
- JWT patterns, Bearer tokens
- Email addresses (partial redaction)

### 4. File Permissions ✅

Created `src/utils/permissions.ts`:

```typescript
export async function ensurePrivateFile(path: string): Promise<void>
export async function ensurePrivateDirectory(path: string): Promise<void>
export async function checkFilePermissions(path: string): Promise<PermissionCheckResult>
export async function scanDirectoryPermissions(dirPath: string): Promise<...>
export async function runSecurityChecks(dataDir: string): Promise<SecurityCheckResult>
```

Features:
- Unix permission checks (0600 for files, 0700 for dirs)
- Windows compatibility (no-op for ACLs)
- Security startup validation
- Root/admin detection warning

### 5. Batch/Stream Processing ✅

Created `src/runner/batch-sync.ts`:

```typescript
export interface BatchSyncOptions {
  batchSize?: number;           // default: 100
  maxConcurrency?: number;      // default: 1
  onProgress?: (progress: SyncProgress) => void;
  enableMemoryMonitor?: boolean;
  memoryThresholdMB?: number;   // default: 500
  backpressureThreshold?: number;
  continueOnError?: boolean;
}

export async function batchSync(
  adapter: GraphAdapter,
  cursorStore: CursorStore,
  applyLogStore: ApplyLogStore,
  projector: Projector,
  options?: BatchSyncOptions
): Promise<BatchSyncResult>

export async function* streamEvents(
  adapter: GraphAdapter,
  cursorStore: CursorStore
): AsyncGenerator<NormalizedEvent[]>
```

Features:
- Memory-efficient batch processing
- Progress callbacks with ETA
- Backpressure handling
- Concurrent processing options
- Error recovery

### 6. Memory Profiling Helpers ✅

Created `src/utils/memory.ts`:

```typescript
export function getMemoryUsage(): MemoryUsage
export function logMemorySnapshot(label: string): void
export class MemoryMonitor {
  start(): void
  check(): { ok: boolean; growthMB: number }
  getStats(): MemoryStats
  getTrend(): { trend: string; rateMBPerMinute: number }
}
export class MemoryWatcher {
  start(): void
  stop(): void
}
export function triggerHeapSnapshot(filename?: string): string | null
export function estimateObjectSize(obj: unknown): number
```

Features:
- Memory usage tracking
- Growth trend analysis
- Threshold-based alerts
- Heap dump support
- Object size estimation

### 7. Timing Utilities ✅

Created `src/utils/timing.ts`:

```typescript
export function sleep(ms: number): Promise<void>
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>
export function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }>
export function debounce<T>(fn: (...args: T) => void, ms: number): (...args: T) => void
export function throttle<T>(fn: (...args: T) => void, ms: number): (...args: T) => void
```

## Files Created/Modified

### New Files
- `src/auth/secure-storage.ts` - Secure credential storage
- `src/config/secure-config.ts` - Secure config resolution
- `src/utils/temp.ts` - Secure temp file utilities
- `src/utils/permissions.ts` - File permission utilities
- `src/utils/memory.ts` - Memory profiling
- `src/utils/timing.ts` - Timing utilities
- `src/logging/sanitize.ts` - Log sanitization
- `src/runner/batch-sync.ts` - Batch/stream processing

### Modified Files
- `src/config/load.ts` - Added secure storage parameter
- `src/index.ts` - Added all new exports

## Definition of Done

- [x] Credentials stored in OS keychain (or encrypted fallback)
- [x] Config supports `{ "$secure": "key" }` references
- [x] Temp files created with 0700 permissions
- [x] Logs sanitize all sensitive fields
- [x] File permissions checked on startup (via runSecurityChecks)
- [x] Batch processing streams messages (no memory bloat)
- [x] Progress callback for large syncs
- [x] Memory monitor warns on excessive growth
- [x] Backpressure handling implemented

## Usage Examples

### Secure Storage
```typescript
import { createSecureStorage } from 'exchange-fs-sync';

const storage = await createSecureStorage('my-mailbox');
await storage.setCredential('client_secret', 'secret-value');
const secret = await storage.getCredential('client_secret');
```

### Batch Sync with Progress
```typescript
import { batchSync } from 'exchange-fs-sync';

const result = await batchSync(adapter, cursorStore, applyLogStore, projector, {
  batchSize: 100,
  onProgress: (p) => console.log(`Progress: ${p.eventsProcessed}/${p.eventsFetched}`),
  enableMemoryMonitor: true,
  memoryThresholdMB: 500,
});
```

### Memory Monitoring
```typescript
import { MemoryMonitor, logMemorySnapshot } from 'exchange-fs-sync';

const monitor = new MemoryMonitor();
monitor.start();

// ... do work ...

const check = monitor.check();
if (!check.ok) {
  console.warn(`Memory grew by ${check.growthMB}MB`);
}
```

### Log Sanitization
```typescript
import { sanitizeForLogging } from 'exchange-fs-sync';

const sensitive = { password: 'secret', data: 'normal' };
const safe = sanitizeForLogging(sensitive);
// safe = { password: '***REDACTED***', data: 'normal' }
```

## Dependencies

- Agent C's retry layer (already integrated)
- keytar (optional, for OS keychain integration)
- Node.js crypto module (built-in)
