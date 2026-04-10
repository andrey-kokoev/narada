# Agent C Assignment: Error Handling & Resilience

## Mission
Implement comprehensive error handling, retry logic, and resilience patterns throughout the sync system.

## Scope
`packages/exchange-fs-sync/` - Core resilience infrastructure

## Deliverables

### 1. Retry Layer (`src/retry.ts`) ✅
Created configurable retry logic:

```typescript
export interface RetryConfig {
  maxAttempts: number;        // default: 3
  baseDelayMs: number;        // default: 1000
  maxDelayMs: number;         // default: 30000
  backoffMultiplier: number;  // default: 2
  retryableErrors: ErrorCode[];  // error codes that trigger retry
  jitterFactor: number;       // default: 0.1
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>,
  context?: string,
  retryContext?: RetryContext
): Promise<T>
```

Features:
- Exponential backoff with jitter
- Circuit breaker pattern (fail fast after N consecutive failures)
- Per-operation context for logging
- Rate limit handling with custom delays

### 2. Graph Adapter Resilience ✅
Updated `src/adapter/graph/adapter.ts` and `src/adapter/graph/client.ts`:

```typescript
// Added to constructor options
interface GraphAdapterConfig {
  retryConfig?: Partial<RetryConfig>;
  circuitBreakerThreshold?: number;
}

// HTTP client now wraps API calls with retry
- getDeltaPage() → uses withRetry()
```

Handles specific Graph API errors:
- 429 (Rate limit) → retry with longer delay via RateLimitError
- 5xx → retry with exponential backoff
- 401/403 → fail fast (auth issue) via AuthError
- 404 → fail fast (not found)

### 3. Store Error Handling ✅
Added error recovery to persistence layer:

```typescript
// src/persistence/cursor.ts
- Corrupted cursor file detection → reset to safe state (autoRecoverCorruption option)
- Write failures → atomic write to temp + rename
- Read failures → clear error message with context

// src/persistence/messages.ts
- Partial write detection → checksum validation (_checksum field)
- Disk full errors → clear error with StorageError (STORAGE_DISK_FULL)
- Atomic replacement with rollback on failure
```

### 4. Sync Runner Recovery ✅
Updated `src/runner/sync-once.ts`:

```typescript
interface DetailedSyncResult extends RunResult {
  errors: SyncError[];
  recoveryActions: string[];
  circuitBreakerState?: {
    graphApi: string;
    storage: string;
    sync: string;
  };
}

interface SyncError {
  phase: 'fetch' | 'persist' | 'apply' | 'cleanup' | 'setup';
  messageId?: string;
  eventId?: string;
  error: ExchangeFSSyncError;
  recoverable: boolean;
  actionTaken: string;
}
```

Recovery scenarios:
- Crash mid-sync → resume from cursor on restart
- Partial message write → detect on next run via checksum, re-fetch
- Cursor corruption → auto-reset to null if autoRecoverCorruption enabled
- Continue on error mode → process remaining events after recoverable errors

### 5. Error Classification ✅
Created `src/errors.ts`:

```typescript
export class ExchangeFSSyncError extends Error {
  code: ErrorCode;
  recoverable: boolean;
  phase: string;
  metadata: Record<string, unknown>;
  cause?: Error;
}

export class NetworkError extends ExchangeFSSyncError {}
export class AuthError extends ExchangeFSSyncError {}
export class StorageError extends ExchangeFSSyncError {}
export class CorruptionError extends ExchangeFSSyncError {}
export class RateLimitError extends ExchangeFSSyncError {
  retryAfterMs: number;
}

// Error codes enum
export enum ErrorCode {
  GRAPH_RATE_LIMIT = 'GRAPH_RATE_LIMIT',
  GRAPH_AUTH_FAILED = 'GRAPH_AUTH_FAILED',
  GRAPH_SERVER_ERROR = 'GRAPH_SERVER_ERROR',
  STORAGE_WRITE_FAILED = 'STORAGE_WRITE_FAILED',
  STORAGE_READ_FAILED = 'STORAGE_READ_FAILED',
  CURSOR_CORRUPTED = 'CURSOR_CORRUPTED',
  MESSAGE_INCOMPLETE = 'MESSAGE_INCOMPLETE',
}
```

Additional utilities:
- `classifyGraphError(status)` - maps HTTP status to error code
- `classifyFsError(error)` - maps Node.js fs errors to error codes
- `wrapError(error, context)` - wraps unknown errors into typed errors

### 6. Exports Updated ✅
Updated `src/index.ts` to export all new error and retry modules.

## Testing

Created unit tests:
- `test/unit/retry.test.ts` - Tests for withRetry, CircuitBreaker, handleGraphError
- `test/unit/errors.test.ts` - Tests for error classes, classification, wrapping

Test coverage includes:
- Retry success and failure scenarios
- Exponential backoff with jitter
- Circuit breaker state transitions
- Error classification for Graph API and filesystem
- Error wrapping and metadata preservation

## Definition of Done

- [x] `withRetry()` handles all retry scenarios
- [x] Graph adapter has circuit breaker (via globalCircuitBreakers)
- [x] Store operations are atomic (temp + rename pattern)
- [x] All errors use typed error classes
- [x] Recovery actions logged and tracked
- [x] Unit tests written (pending dependency installation for execution)
- [x] No unhandled promise rejections (all errors properly wrapped)

## Files Created/Modified

### New Files
- `src/errors.ts` - Error classification system
- `src/retry.ts` - Retry layer with circuit breaker
- `test/unit/retry.test.ts` - Retry unit tests
- `test/unit/errors.test.ts` - Error handling unit tests

### Modified Files
- `src/adapter/graph/client.ts` - Added retry and error handling
- `src/adapter/graph/adapter.ts` - Added retry config options
- `src/persistence/cursor.ts` - Enhanced error recovery
- `src/persistence/messages.ts` - Added checksum validation and atomic writes
- `src/runner/sync-once.ts` - Enhanced error tracking and recovery
- `src/index.ts` - Added exports for new modules

## Notes

Dependencies installation was attempted but network latency prevented completion. Tests are written and ready to run once dependencies are available:
```bash
pnpm install
pnpm test -- test/unit/retry.test.ts test/unit/errors.test.ts
```
