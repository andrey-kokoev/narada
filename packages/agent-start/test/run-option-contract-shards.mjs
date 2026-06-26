import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcessTests } from './helpers/process-test-runner.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const testFile = 'test/option-contract.test.mjs';
const source = readFileSync(resolve(packageRoot, testFile), 'utf8');
const testNames = [...source.matchAll(/^test\('([^']+)'/gm)].map((match) => match[1]);

if (testNames.length === 0) {
  console.error('No option-contract tests found to shard.');
  process.exit(1);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shard(values, shardCount) {
  return values.reduce((groups, value, index) => {
    groups[index % shardCount].push(value);
    return groups;
  }, Array.from({ length: shardCount }, () => []));
}

const shardCount = Math.min(8, testNames.length);
const commands = shard(testNames, shardCount)
  .filter((names) => names.length > 0)
  .map((names, index) => ({
    label: `option-contract:${index + 1}`,
    args: [
      '--test',
      '--test-name-pattern',
      `^(?:${names.map(escapeRegExp).join('|')})$`,
      testFile,
    ],
    cwd: packageRoot,
    timeoutMs: 8500,
  }));

await runProcessTests(commands);
