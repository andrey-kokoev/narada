# Agent E Assignment: Testing & Validation Infrastructure

## Mission
Establish comprehensive testing framework and configuration validation.

## Scope
`packages/exchange-fs-sync/` - Core testing  
`packages/exchange-fs-sync-cli/` - CLI testing

## Deliverables

### 1. Test Framework Setup

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      }
    },
    setupFiles: ['./test/setup.ts']
  }
});
```

Setup file provides:
- Mock file system (memfs)
- Mock Graph adapter (uses Agent B's mock)
- Test data factories

### 2. Unit Tests

Priority test coverage:

```
src/adapter/graph/
  ├── normalize.test.ts       # ID normalization, scopes
  └── adapter.test.ts         # with Agent B's mock

src/persistence/
  ├── file-cursor.test.ts     # CRUD, corruption handling
  ├── file-message.test.ts    # write/read, batching
  └── file-view.test.ts       # projection consistency

src/runner/
  └── sync-once.test.ts       # full sync lifecycle

src/config/
  └── validation.test.ts      # schema validation
```

### 3. Integration Tests

```typescript
// test/integration/sync-lifecycle.test.ts
describe('Full Sync Lifecycle', () => {
  it('should sync messages from empty state', async () => {
    // Setup: empty data dir, mock with 100 messages
    // Run: syncOnce()
    // Verify: messages on disk, cursor updated, health file
  });

  it('should resume from cursor', async () => {
    // Setup: existing cursor at message 50
    // Run: syncOnce()
    // Verify: only fetches 51-100
  });

  it('should handle Graph API failures', async () => {
    // Setup: mock with 50% failure rate
    // Run: syncOnce()
    // Verify: retries, partial success, health shows errors
  });
});
```

### 4. Property-Based Tests

```typescript
// Test ID normalization invariants
fc.assert(fc.property(
  fc.string(),
  (rawId) => {
    const normalized = normalizeMessageId(rawId);
    // invariant: normalized always matches pattern
    return /^[a-zA-Z0-9_-]+$/.test(normalized);
  }
));
```

### 5. Configuration Validation (Zod)

```typescript
// src/config/schema.ts
import { z } from 'zod';

export const ConfigSchema = z.object({
  mailbox_id: z.string().min(1),
  root_dir: z.string().min(1),
  graph: z.object({
    user_id: z.string().email(),
    client_id: z.string().min(1),
    client_secret: z.string().min(1),
    tenant_id: z.string().min(1),
  }),
  sync: z.object({
    batch_size: z.number().int().min(1).max(1000).default(100),
    parallel: z.boolean().default(false),
  }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

// Validation function
export function validateConfig(raw: unknown): { 
  success: true; 
  data: Config;
} | {
  success: false;
  errors: z.ZodError;
  formatted: string[];  // human-readable errors
} {
  const result = ConfigSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error,
    formatted: result.error.errors.map(e => 
      `${e.path.join('.')}: ${e.message}`
    )
  };
}
```

### 6. Test Utilities

```typescript
// test/factories.ts
export function createMockMessage(overrides?: Partial<Message>): Message {
  return {
    id: `msg_${randomId()}`,
    subject: 'Test Subject',
    receivedDateTime: new Date().toISOString(),
    ...overrides
  };
}

export function createTestConfig(overrides?: Partial<Config>): Config {
  return {
    mailbox_id: 'test@example.com',
    root_dir: '/tmp/test-data',
    graph: {
      user_id: 'test@example.com',
      client_id: 'test-client',
      client_secret: 'test-secret',
      tenant_id: 'test-tenant',
    },
    ...overrides
  };
}

// test/setup.ts
import { fs, vol } from 'memfs';

beforeEach(() => {
  vol.reset();
});

// Mock fs module globally
vi.mock('fs', () => ({ default: fs, ...fs }));
vi.mock('fs/promises', () => ({ default: fs.promises, ...fs.promises }));
```

### 7. CLI Command Tests

```typescript
// packages/exchange-fs-sync-cli/test/commands/status.test.ts
describe('status command', () => {
  it('shows healthy status', async () => {
    // Setup: healthy state
    // Run: statusCommand()
    // Verify: exit code 0, health === 'healthy'
  });

  it('shows stale status when no recent sync', async () => {
    // Setup: old sync timestamp
    // Run: statusCommand()
    // Verify: health === 'stale'
  });
});
```

## Test Data Fixtures

```
test/fixtures/
├── messages/
│   ├── simple.json
│   ├── with-attachments.json
│   └── unicode-subject.json
├── cursors/
│   ├── empty.json
│   └── partial.json
└── config/
    ├── valid.json
    ├── missing-field.json
    └── invalid-email.json
```

## CI Integration

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test
      - run: pnpm coverage
```

## Definition of Done

- [ ] Vitest configured with coverage
- [ ] All core modules have unit tests
- [ ] Integration tests for full sync
- [ ] Zod schema validates all config
- [ ] Clear error messages for invalid config
- [ ] 70%+ line coverage
- [ ] CI runs tests on PR
- [ ] Mock adapter used in tests

## Dependencies
- Agent B's mock adapter (for integration tests)

## Time Estimate
6 hours
