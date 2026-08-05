import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcessTests } from './helpers/process-test-runner.js';
import {
  agentStartScriptArgs,
  agentStartTestArgs,
  isBunTestRuntime,
} from './helpers/agent-start-test-runtime.js';

const __dirname: any = dirname(fileURLToPath(import.meta.url));
const packageRoot: any = resolve(__dirname, '..');

await runProcessTests([
  {
    label: 'result-contract-generated-artifacts',
    args: agentStartScriptArgs('scripts/generate-result-schema.ts', '--check'),
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'result-contract-generator-line-endings',
    args: agentStartTestArgs('test/generate-result-schema.test.ts'),
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'agent-start-tsx-transform-syntax',
    command: isBunTestRuntime ? 'node' : process.execPath,
    args: ['--import', 'tsx', '--check', 'src/narada-agent-start.ts'],
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'verify-launcher-bin-syntax',
    command: isBunTestRuntime ? 'node' : process.execPath,
    args: ['--import', 'tsx', '--check', 'bin/verify-registered-site-launchers.ts'],
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'agent-start-dry-run-smoke',
    args: agentStartTestArgs('test/agent-start-dry-run-smoke.test.ts'),
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'provider-module-contract',
    args: agentStartTestArgs('test/provider-module-contract.test.ts'),
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'carrier-process-launch-contract',
    args: agentStartTestArgs('test/carrier-process-launch.test.ts'),
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'launch-result-contract',
    args: agentStartTestArgs('test/launch-result-contract.test.ts'),
    cwd: packageRoot,
    timeoutMs: 15000,
  },
  {
    label: 'launcher-registry-contract-shards',
    args: agentStartScriptArgs('test/run-launcher-registry-contract-shards.ts'),
    cwd: packageRoot,
    // The shard chain takes ~18s standalone; under the 9-way parallel runner
    // on a loaded machine the old 15s ceiling killed it before any assertion ran.
    timeoutMs: 60000,
  },
  {
    label: 'option-contract-shards',
    args: agentStartScriptArgs('test/run-option-contract-shards.ts'),
    cwd: packageRoot,
    // The option shards each pay a cold launcher/module-load cost and run
    // concurrently with the other package probes.
    timeoutMs: 60000,
  },
]);
