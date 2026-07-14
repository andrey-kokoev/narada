import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcessTests } from './helpers/process-test-runner.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

await runProcessTests([
  {
    label: 'result-contract-generated-artifacts',
    args: ['--import', 'tsx', 'scripts/generate-result-schema.ts', '--check'],
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'agent-start-tsx-transform-syntax',
    args: ['--import', 'tsx', '--check', 'src/narada-agent-start.ts'],
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'verify-launcher-bin-syntax',
    args: ['--check', 'bin/verify-registered-site-launchers.mjs'],
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'agent-start-dry-run-smoke',
    args: ['--test', 'test/agent-start-dry-run-smoke.test.mjs'],
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'provider-module-contract',
    args: ['--import', 'tsx', '--test', 'test/provider-module-contract.test.mjs'],
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'carrier-process-launch-contract',
    args: ['--import', 'tsx', '--test', 'test/carrier-process-launch.test.mjs'],
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'launch-result-contract',
    args: ['--import', 'tsx', '--test', 'test/launch-result-contract.test.mjs'],
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'launcher-registry-contract-shards',
    args: ['test/run-launcher-registry-contract-shards.mjs'],
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'option-contract-shards',
    args: ['test/run-option-contract-shards.mjs'],
    cwd: packageRoot,
    timeoutMs: 15000,
  },
]);
