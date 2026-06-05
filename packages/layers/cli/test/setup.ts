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
import { tmpdir } from 'node:os';
import { vol } from 'memfs';

process.env.NARADA_GIT_BINARY ??= 'git';

beforeEach(() => {
  vol.reset();
  vol.mkdirSync('/tmp', { recursive: true });
  vol.mkdirSync('/test', { recursive: true });
  vol.mkdirSync(tmpdir().replace(/\\/g, '/'), { recursive: true });
});
