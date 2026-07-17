import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testPath = resolve(packageRoot, 'test', 'integration', 'published-cli-install.test.mjs');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', testPath], {
  stdio: 'inherit',
  env: { ...process.env, NARADA_RUN_PUBLICATION_E2E: '1' },
});

process.exit(result.status ?? 1);
