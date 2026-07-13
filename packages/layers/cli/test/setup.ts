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

const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
const carrierRuntimeContractRoot = new URL(
  '../../../carrier-runtime-contract/contracts/',
  import.meta.url,
);
const carrierRuntimeContractNames = [
  'launch-slice.json',
  'carrier-launch-matrix.json',
  'boolean-values.json',
  'runtime-substrate-kinds.json',
  'mcp-runtime.json',
  'terminal-runtime.json',
];

function seedCarrierRuntimeContracts(): void {
  vol.fromJSON(Object.fromEntries(carrierRuntimeContractNames.map((name) => [
    new URL(name, carrierRuntimeContractRoot).pathname,
    realFs.readFileSync(new URL(name, carrierRuntimeContractRoot), 'utf8'),
  ])));
}

seedCarrierRuntimeContracts();

beforeEach(() => {
  vol.reset();
  vol.mkdirSync('/tmp', { recursive: true });
  vol.mkdirSync('/test', { recursive: true });
  vol.mkdirSync(tmpdir().replace(/\\/g, '/'), { recursive: true });
  seedCarrierRuntimeContracts();
});
