import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { waitForEnterBeforeCarrier } from '../src/carrier-process-launch.ts';

test('wait prompt passes canonical agent identity ref to renderer', async () => {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  const stdout = new PassThrough();
  const calls = [];
  const agentIdentityRef = {
    schema: 'narada.agent_identity_ref.v1',
    site_id: 'sonar',
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'sonar.resident',
    display: 'sonar.resident',
    source_agent_id: 'resident',
    scope: 'site_scoped',
  };

  const waiting = waitForEnterBeforeCarrier({
    agentId: 'resident',
    agentIdentityRef,
    carrierName: 'agent-runtime-server',
    stdin,
    stdout,
    writeStdout: async () => {},
    loadAgentStartRenderer: async () => ({
      formatAgentStartWaitPrompt(agentId, runtimeName, options) {
        calls.push({ agentId, runtimeName, options });
        return 'prompt> ';
      },
    }),
  });

  setImmediate(() => stdin.write('\n'));
  await waiting;

  assert.equal(calls.length, 1);
  assert.equal(calls[0].agentId, 'resident');
  assert.equal(calls[0].runtimeName, 'agent-runtime-server');
  assert.deepEqual(calls[0].options, { agentIdentityRef });
});
