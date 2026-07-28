import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testFile = process.platform === 'linux'
  ? 'published-linux-cli-install.test.ts'
  : 'published-cli-install.test.ts';
const testPath = resolve(packageRoot, 'test', 'integration', testFile);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', testPath], {
  stdio: 'inherit',
  env: { ...process.env, NARADA_RUN_PUBLICATION_E2E: '1' },
});

process.exit(result.status ?? 1);
