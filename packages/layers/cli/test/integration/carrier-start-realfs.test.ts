import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { carrierStartCommand } from '../../src/commands/carrier.ts';
import { ExitCode } from '../../src/lib/exit-codes.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const naradaProperRoot = resolve(__dirname, '..', '..', '..', '..', '..');

test('carrier start dry-run uses real filesystem result-file handoff', async () => {
  const previousNaradaProperRoot = process.env.NARADA_PROPER_ROOT;
  process.env.NARADA_PROPER_ROOT = naradaProperRoot;
  try {
    const result = await carrierStartCommand({
      siteRoot: naradaProperRoot,
      workspaceRoot: naradaProperRoot,
      agent: 'narada.architect',
      carrier: 'agent-cli',
      dryRun: true,
      format: 'json',
    }, {});

    assert.equal(result.exitCode, ExitCode.SUCCESS, JSON.stringify(result.result));
    assert.equal(result.result.status, 'success');
    assert.equal(result.result.carrier, 'agent-cli');
    assert.equal(result.result.runtime, 'narada-agent-runtime-server');
    assert.equal(result.result.agent_start.status, 'success');
    assert.equal(result.result.agent_start.result_handoff, 'json_output_file');
    assert.equal(result.result.agent_start.parsed_result.carrier_kind, 'agent-cli');
    assert.equal(result.result.agent_start.parsed_result.runtime_substrate_kind, 'narada-agent-runtime-server');
    assert.equal(result.result.agent_start.parsed_result.required_environment.NARADA_WORKSPACE_ROOT, naradaProperRoot);

    const resultFile = result.result.agent_start.result_file;
    assert.equal(typeof resultFile, 'string');
    assert.equal(existsSync(resultFile), true, `result file missing: ${resultFile}`);
    const persisted = JSON.parse(readFileSync(resultFile, 'utf8'));
    assert.equal(persisted.carrier_kind, 'agent-cli');
    assert.equal(persisted.runtime_substrate_kind, 'narada-agent-runtime-server');

    const human = await carrierStartCommand({
      siteRoot: naradaProperRoot,
      workspaceRoot: naradaProperRoot,
      agent: 'narada.architect',
      carrier: 'agent-cli',
      dryRun: true,
      format: 'human',
    }, {});

    assert.equal(human.exitCode, ExitCode.SUCCESS, JSON.stringify(human.result));
    assert.match(human.result._formatted, /^Narada operator surface start success: agent-cli \/ narada-agent-runtime-server\. Result: /);
    assert.doesNotMatch(human.result._formatted, /narada\.operator_surface\.runtime_start_result\.v1/);
  } finally {
    if (previousNaradaProperRoot === undefined) delete process.env.NARADA_PROPER_ROOT;
    else process.env.NARADA_PROPER_ROOT = previousNaradaProperRoot;
  }
});
