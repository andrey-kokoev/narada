# Agent D Assignment: Observability & Metrics

## Mission
Add comprehensive logging, metrics, and observability hooks for production monitoring.

## Scope
Both packages - logging infrastructure and metrics collection

## Deliverables

### 1. Structured Logging (`src/logging/structured.ts`)
Replace console.error with structured logger:

```typescript
export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context: string;        // e.g., "GraphAdapter", "SyncRunner"
  operation?: string;     // e.g., "fetchMessages"
  durationMs?: number;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, error?: Error, meta?: Record<string, unknown>): void;
  child(context: string): Logger;
}

export function createLogger(context: string): Logger
```

Output formats:
- Development: Pretty printed with colors
- Production: JSON lines (one object per line)

### 2. Metrics Collection (`src/metrics.ts`)

```typescript
export interface MetricsSnapshot {
  timestamp: string;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, number[]>;
}

export class MetricsCollector {
  increment(counter: string, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  histogram(name: string, value: number, tags?: Record<string, string>): void;
  timing<T>(name: string, fn: () => Promise<T>): Promise<T>;
  snapshot(): MetricsSnapshot;
  reset(): void;
}

// Global singleton
export const metrics = new MetricsCollector();

// Key metrics to track:
// - sync.messages_fetched
// - sync.messages_written
// - sync.errors
// - sync.duration_ms
// - graph.requests
// - graph.rate_limited
// - graph.errors
// - storage.reads
// - storage.writes
// - storage.bytes_written
```

### 3. OpenTelemetry Integration
Add tracing for operations:

```typescript
// src/tracing.ts
import { trace, Span } from '@opentelemetry/api';

export function createSpan(name: string, fn: (span: Span) => Promise<T>): Promise<T>;

// Use in key operations:
// - Full sync run
// - Graph API calls
// - Batch message writes
// - View updates
```

### 4. Health Metrics Endpoint
Update Agent B's health file:

```typescript
// Extend health file with metrics
interface HealthFile {
  // ... existing fields ...
  metrics: {
    lastSyncDurationMs: number;
    messagesPerSecond: number;
    errorRate: number;
    consecutiveFailures: number;
  };
  recentErrors: Array<{
    timestamp: string;
    code: string;
    message: string;
  }>;
}
```

### 5. CLI Integration
Update CLI to support logging options:

```typescript
// packages/exchange-fs-sync-cli/src/main.ts
program
  .option('--log-level <level>', 'debug|info|warn|error', 'info')
  .option('--log-format <format>', 'pretty|json', 'auto')
  .option('--metrics-output <file>', 'Write metrics to file on exit')
```

### 6. Log Rotation
Add file-based logging with rotation:

```typescript
// src/logging/file.ts
export interface FileLoggerConfig {
  directory: string;
  maxSize: string;      // e.g., "10MB"
  maxFiles: number;     // e.g., 5
  compress: boolean;
}

export function createFileLogger(config: FileLoggerConfig): Logger;
```

Default: Write to `{dataDir}/logs/exchange-sync.log`

## Key Metrics Dashboard

Metrics to expose (for external dashboard consumption):

| Metric | Type | Description |
|--------|------|-------------|
| sync_total | counter | Total sync runs |
| sync_success | counter | Successful syncs |
| sync_failed | counter | Failed syncs |
| messages_fetched | counter | Messages from Graph |
| messages_written | counter | Messages to disk |
| sync_duration | histogram | Time per sync |
| graph_latency | histogram | Graph API response time |
| graph_errors | counter | Graph API errors |
| storage_latency | histogram | File I/O time |

## Testing Requirements

1. Logger outputs valid JSON
2. Metrics aggregation is accurate
3. File rotation works
4. Child loggers inherit context

## Definition of Done

- [ ] Structured logging replaces all console.*
- [ ] Metrics collected for all key operations
- [ ] Log rotation configured
- [ ] Health file includes metrics
- [ ] CLI supports log level/format options
- [ ] No PII in logs (sanitize message subjects, emails)
- [ ] Performance: logging adds <1% overhead

## Dependencies
- Agent B's health file (extend with metrics)
- Agent C's error types (for structured error logging)

## Time Estimate
4 hours
