import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcessTests } from './helpers/process-test-runner.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const testFile = 'test/launcher-registry-contract.test.mjs';
const source = readFileSync(resolve(packageRoot, testFile), 'utf8');
const testNames = [...source.matchAll(/^test\('([^']+)'/gm)].map((match) => match[1]);

if (testNames.length === 0) {
  console.error('No launcher-registry tests found to shard.');
  process.exit(1);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const commands = testNames.map((name, index) => ({
  label: `launcher-registry:${index + 1}`,
  args: [
    '--test',
    '--test-name-pattern',
    `^${escapeRegExp(name)}$`,
    testFile,
  ],
  cwd: packageRoot,
  timeoutMs: 8000,
}));

await runProcessTests(commands);
