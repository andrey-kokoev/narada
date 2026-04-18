# Performance Targets

This document defines the performance expectations and targets for the Narada kernel system.

## Benchmarks

Run benchmarks with:

```bash
# All benchmarks
pnpm benchmark

# Specific benchmark file
pnpm benchmark -- sync.bench

# Watch mode
pnpm benchmark:watch

# Generate report
pnpm benchmark:report
```

## Performance Targets

### Sync Operations

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Sync 100 messages | < 500ms | > 1000ms |
| Sync 1,000 messages | < 3000ms | > 5000ms |
| Sync 10,000 messages | < 30000ms | > 60000ms |
| Messages per second | > 500 | < 200 |

### Store Operations

| Operation | Target | Critical Threshold |
|-----------|--------|-------------------|
| Write single message | < 10ms | > 50ms |
| Read single message | < 5ms | > 20ms |
| Check existence | < 2ms | > 10ms |
| Write 1MB blob | < 50ms | > 200ms |
| Read 1MB blob | < 20ms | > 100ms |

### Adapter Operations

| Operation | Target | Critical Threshold |
|-----------|--------|-------------------|
| Normalize message | < 1ms | > 5ms |
| Parse delta entry | < 2ms | > 10ms |
| Build event ID | < 0.1ms | > 1ms |
| Content hash (small) | < 0.5ms | > 2ms |
| Batch normalize 100 | < 50ms | > 200ms |

### View Operations

| Query | Target | Critical Threshold |
|-------|--------|-------------------|
| By date range (100) | < 20ms | > 100ms |
| By date range (1000) | < 100ms | > 500ms |
| By thread | < 10ms | > 50ms |
| Full-text search | < 50ms | > 200ms |
| Rebuild all views (500) | < 1000ms | > 5000ms |

### Memory Usage

| Scenario | Target | Critical Threshold |
|----------|--------|-------------------|
| Sync 100 messages | < 50MB delta | > 200MB |
| Sync 1,000 messages | < 200MB peak | > 500MB |
| Memory growth (10 cycles) | < 100MB | > 500MB |
| Normalization (1000 iter) | < 5MB | > 50MB |

## Regression Thresholds

Benchmarks fail CI if:

- Any benchmark regresses by > 10%
- Memory usage increases by > 20%
- Critical thresholds are exceeded

## Baseline Management

Baselines are stored in `.benchmarks/baselines/`:

```
.benchmarks/
├── baselines/
│   ├── latest.json       # Most recent baseline
│   ├── 0.1.0.json        # Version-specific baseline
│   └── 0.2.0.json
```

Update baseline (main branch only):
```bash
pnpm benchmark:baseline
```

Compare with baseline:
```bash
pnpm benchmark:compare
```

## Profiling

Generate CPU profiles:

```bash
# Profile sync operations
node --inspect scripts/profile.ts 5000 sync

# Profile normalization
node --inspect scripts/profile.ts 5000 normalization
```

View profiles in Chrome DevTools:
1. Open Chrome DevTools
2. Performance tab
3. Load Profile
4. Select `.cpuprofile` file

## System Requirements

Benchmarks assume:

- Node.js 18+
- SSD storage
- 4+ CPU cores
- 8GB+ RAM

Results may vary on different hardware. CI runs on GitHub Actions runners for consistency.
