import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcessTests } from './helpers/process-test-runner.js';
import { agentStartTestArgs } from './helpers/agent-start-test-runtime.js';

const __dirname: any = dirname(fileURLToPath(import.meta.url));
const packageRoot: any = resolve(__dirname, '..');
const testFile: any = 'test/launcher-registry-contract.test.ts';
const source: any = readFileSync(resolve(packageRoot, testFile), 'utf8');
const testNames: any = [...source.matchAll(/^test\('([^']+)'/gm)].map((match: any) => match[1]);

if (testNames.length === 0) {
  console.error('No launcher-registry tests found to shard.');
  process.exit(1);
}

function escapeRegExp(value: any) : any{
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const commands: any = testNames.map((name: any, index: any) => ({
  label: `launcher-registry:${index + 1}`,
  args: agentStartTestArgs(testFile, `^${escapeRegExp(name)}$`),
  cwd: packageRoot,
  // Shards run concurrently and each re-pays full module load; the cold first
  // shard starves past 15s on a loaded machine. 45s keeps this an infra ceiling,
  // not a flake generator.
  timeoutMs: 45000,
}));

await runProcessTests(commands);
