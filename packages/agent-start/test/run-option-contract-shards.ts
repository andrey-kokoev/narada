import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcessTests } from './helpers/process-test-runner.js';

const __dirname: any = dirname(fileURLToPath(import.meta.url));
const packageRoot: any = resolve(__dirname, '..');
const testFile: any = 'test/option-contract.test.ts';
const source: any = readFileSync(resolve(packageRoot, testFile), 'utf8');
const testNames: any = [...source.matchAll(/^test\('([^']+)'/gm)].map((match: any) => match[1]);

if (testNames.length === 0) {
  console.error('No option-contract tests found to shard.');
  process.exit(1);
}

function escapeRegExp(value: any) : any{
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shard(values: any, shardCount: any) : any{
  return values.reduce((groups: any, value: any, index: any) => {
    groups[index % shardCount].push(value);
    return groups;
  }, Array.from({ length: shardCount }, () => []));
}

const shardCount: any = Math.min(8, testNames.length);
const commands: any = shard(testNames, shardCount)
  .filter((names: any) => names.length > 0)
  .map((names: any, index: any) => ({
    label: `option-contract:${index + 1}`,
    args: [
      '--import',
      'tsx',
      '--test',
      '--test-name-pattern',
      `^(?:${names.map(escapeRegExp).join('|')})$`,
      testFile,
    ],
    cwd: packageRoot,
    // Each shard pays the full tsx/launcher module-load cost concurrently;
    // the cold first shard can exceed 15s on a loaded Windows host. Keep the
    // timeout as an infrastructure ceiling rather than a flake generator.
    timeoutMs: 45000,
  }));

await runProcessTests(commands);
