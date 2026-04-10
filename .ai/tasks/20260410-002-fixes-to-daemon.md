# Task: Fix exchange-fs-sync-daemon Package

**Status:** Ready for implementation  
**Priority:** High (package is non-functional)  
**Estimated effort:** 2-3 hours

---

## Summary

The `exchange-fs-sync-daemon` package has critical bugs that prevent it from working with built packages and could cause production issues. This task tracks all required fixes.

---

## Critical Issues (Must Fix)

### 1. Broken Import Paths
**File:** `src/service.ts` (lines 6-20)

**Problem:** Deep imports from `/src/` paths won't work after TypeScript compilation:
```typescript
import type { ExchangeFsSyncConfig } from 'exchange-fs-sync/src/config/types.js';
import { loadConfig } from 'exchange-fs-sync/src/config/load.js';
```

**Fix:** Use package exports:
```typescript
import {
  loadConfig,
  buildGraphTokenProvider,
  GraphHttpClient,
  // ...etc
} from 'exchange-fs-sync';
import type { ExchangeFsSyncConfig } from 'exchange-fs-sync';
```

**Also requires:** Add `export { ExchangeFsSyncConfig }` to core package's `src/index.ts` if not already exported.

---

### 2. Fix package.json
**File:** `package.json`

**Changes needed:**
1. Change `workspace:*` to `file:../exchange-fs-sync` (for npm compatibility)
2. Change build script from `rolldown --config` to `tsc`
3. Remove unused devDependencies (rolldown, oxlint, oxfmt)
4. Add `exports` field for proper module resolution

**Reference:** Copy structure from `exchange-fs-sync-cli/package.json`

---

### 3. Fix tsconfig.json
**File:** `tsconfig.json`

**Changes needed:**
1. Change `"rootDir": "."` to `"rootDir": "./src"`
2. Remove unnecessary strict options that cause build failures

---

### 4. Fatal Shutdown Bug
**File:** `src/index.ts` (lines 49-61)

**Problem:** Timeout race condition doesn't work as intended:
```typescript
const timeout = setTimeout(daemonConfig.shutdownTimeoutMs, 'timeout');
await Promise.race([
  service.stop(),
  timeout,  // Resolves to 'timeout', doesn't reject
]);
```

**Fix:**
```typescript
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(daemonConfig.shutdownTimeoutMs, reject(new Error('Shutdown timeout')))
);

try {
  await Promise.race([service.stop(), timeoutPromise]);
  console.log('[daemon] Shutdown complete');
  process.exit(0);
} catch (error) {
  console.error('[daemon] Shutdown timed out or failed');
  process.exit(1);
}
```

---

## High Priority Issues (Should Fix)

### 5. Add AbortController for Cooperative Cancellation
**File:** `src/service.ts`

**Problem:** Long-running syncs cannot be interrupted.

**Implementation:**
- Add `AbortSignal` parameter to `createSyncService`
- Pass signal through to HTTP client calls
- Check `signal.aborted` in sync loop

---

### 6. Add Exponential Backoff for Errors
**File:** `src/service.ts` - `runLoop()` function

**Problem:** On persistent errors, daemon loops forever with fixed interval.

**Fix:**
```typescript
class ExponentialBackoff {
  private delay = 5000; // Start at 5s
  private maxDelay = 300000; // Max 5 minutes
  
  next(): number {
    const current = this.delay;
    this.delay = Math.min(this.delay * 2, this.maxDelay);
    return current;
  }
  
  reset(): void {
    this.delay = 5000;
  }
}

// In runLoop:
const backoff = new ExponentialBackoff();
while (running && !stopRequested) {
  const result = await runSingleSync();
  if (result.status === 'success') {
    backoff.reset();
  } else {
    const delay = backoff.next();
    console.log(`[service] Backing off for ${delay}ms`);
    await sleep(delay);
    continue;
  }
  await sleep(pollingIntervalMs);
}
```

---

### 7. Classify Errors Properly
**File:** `src/service.ts` - `runSingleSync()`

**Problem:** All errors treated the same.

**Implementation:**
```typescript
if (result.status === 'fatal_failure') {
  stats.errors++;
  console.error(`[service] Fatal error, stopping: ${result.error}`);
  await this.stop();
  return;
}
```

---

## Medium Priority (Nice to Have)

### 8. Add PID File Support
**New file:** `src/pid-file.ts`

**Purpose:** Prevent double-start, allow external monitoring.

```typescript
export async function writePidFile(path: string): Promise<void> {
  await writeFile(path, String(process.pid), 'utf8');
}

export async function removePidFile(path: string): Promise<void> {
  await rm(path).catch(() => {});
}
```

---

### 9. Add Health Check Endpoint
**File:** `src/service.ts`

**Simple HTTP health endpoint or file-based health:**
```typescript
async function updateHealthFile(): Promise<void> {
  const health = {
    status: running ? 'healthy' : 'stopped',
    lastSync: stats.lastSyncAt?.toISOString(),
    cycles: stats.cyclesCompleted,
    errors: stats.errors,
    pid: process.pid,
  };
  await writeFile(join(rootDir, '.health.json'), JSON.stringify(health));
}
```

---

### 10. Add Structured Logging
**New file:** `src/logger.ts`

Replace `console.log` with structured logger:
```typescript
interface Logger {
  info(msg: string, meta?: object): void;
  error(msg: string, error?: Error, meta?: object): void;
  debug(msg: string, meta?: object): void;
}
```

---

## Implementation Checklist

- [ ] Fix import paths in `src/service.ts`
- [ ] Update `package.json` with correct deps and scripts
- [ ] Fix `tsconfig.json` rootDir
- [ ] Fix shutdown timeout bug
- [ ] Add exponential backoff
- [ ] Add proper error classification
- [ ] Add AbortController support
- [ ] Add PID file support
- [ ] Add health check
- [ ] Add structured logging
- [ ] Test build: `npm run build`
- [ ] Test typecheck: `npm run typecheck`
- [ ] Test daemon start/stop manually

---

## Testing Commands

```bash
# Build
cd packages/exchange-fs-sync-daemon
npm run build

# Verify imports work
node -e "import('./dist/service.js').then(m => console.log('OK'))"

# Test daemon (requires config)
node dist/index.js &
DAEMON_PID=$!
sleep 2
kill $DAEMON_PID
```

---

## Related Files

- `packages/exchange-fs-sync/src/index.ts` - May need to export additional types
- `packages/exchange-fs-sync-cli/` - Reference for working package structure
- `packages/exchange-fs-sync-cli/src/lib/logger.ts` - Reference logger implementation

---

## Notes

- Keep the service interface simple: `start()`, `stop()`
- Don't add complexity until basic fixes are verified
- The `normalize_folder_ref` and `normalize_flagged` imports also need to come from package exports
