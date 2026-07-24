import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { probeCodexSubscriptionService } from './codex-subscription-readiness.mjs';

test('Codex preflight is independent of ambient config and pins the selected route', () => {
  const authHome = mkdtempSync(join(tmpdir(), 'narada-codex-readiness-'));
  try {
    let invocation = null;
    const result = probeCodexSubscriptionService({
      env: {
        NARADA_CODEX_AUTH_HOME: authHome,
        NARADA_AI_MODEL: 'ambient-invalid-model',
        NARADA_AI_THINKING: 'max',
        NARADA_CODEX_EXEC_COMMAND: 'codex',
      },
      session: 'probe-route-test',
      model: 'gpt-5.5',
      thinking: 'medium',
      runProbeSync(request, options) {
        invocation = { request, options };
        return { status: 0, signal: null, stdout: '', stderr: '' };
      },
    });
    assert.equal(result.status, 'ready');
    assert.deepEqual(invocation.request.argv, [
      'exec',
      '--json',
      '--ephemeral',
      '--ignore-user-config',
      '--model',
      'gpt-5.5',
      '-c',
      'model_reasoning_effort="medium"',
      'Return exactly: ok',
    ]);
    assert.equal(invocation.options.spawnOptions.env.CODEX_HOME, authHome);
    assert.equal(invocation.request.env.OPENAI_API_KEY, undefined);
    assert.equal(result.probe.model, 'gpt-5.5');
    assert.equal(result.probe.reasoning_effort, 'medium');
  } finally {
    rmSync(authHome, { recursive: true, force: true });
  }
});

test('Codex preflight accepts a complete structured turn when the CLI does not exit', () => {
  const authHome = mkdtempSync(join(tmpdir(), 'narada-codex-readiness-'));
  try {
    const result = probeCodexSubscriptionService({
      env: {
        NARADA_CODEX_AUTH_HOME: authHome,
        NARADA_CODEX_EXEC_COMMAND: 'codex',
      },
      session: 'probe-completion-test',
      runProbeSync() {
        return {
          status: null,
          signal: 'SIGTERM',
          error: new Error('ETIMEDOUT'),
          stdout: [
            JSON.stringify({ type: 'turn.started' }),
            JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }),
            JSON.stringify({ type: 'turn.completed' }),
          ].join('\n'),
          stderr: 'Reading additional input from stdin',
        };
      },
    });
    assert.equal(result.status, 'ready');
    assert.equal(result.probe.success_basis, 'structured_turn_completed');
    assert.equal(result.probe.completion_observed, true);
  } finally {
    rmSync(authHome, { recursive: true, force: true });
  }
});
