import { vi } from 'vitest';

// Mock fs modules with memfs
vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return { default: fs, ...fs };
});

vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return { default: fs.promises, ...fs.promises };
});

// Reset memfs volume before each test
import { beforeEach } from 'vitest';
import { vol } from 'memfs';

beforeEach(() => {
  vol.reset();
});

// Global test utilities
declare global {
  var createMockGraphResponse: typeof import('./factories').createMockGraphResponse;
  var createMockMessage: typeof import('./factories').createMockMessage;
  var createTestConfig: typeof import('./factories').createTestConfig;
}
