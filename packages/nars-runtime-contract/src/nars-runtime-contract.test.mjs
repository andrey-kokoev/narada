import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NARS_RUNTIME_EXECUTION_POLICY_RECONFIGURE_METHOD,
  NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD,
  NARS_RUNTIME_SERVER_METHOD_LIST,
  buildNarsRuntimeExecutionPolicyReconfigureFrame,
  buildNarsRuntimeIntelligenceReconfigureFrame,
  isNarsRuntimeServerMethod,
} from './nars-runtime-contract.mjs';

test('runtime contract owns the admitted method registry', () => {
  assert.deepEqual(NARS_RUNTIME_SERVER_METHOD_LIST, [
    'runtime.intelligence.reconfigure',
    'runtime.execution_policy.reconfigure',
  ]);
  assert.equal(NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD, 'runtime.intelligence.reconfigure');
  assert.equal(NARS_RUNTIME_EXECUTION_POLICY_RECONFIGURE_METHOD, 'runtime.execution_policy.reconfigure');
  assert.equal(isNarsRuntimeServerMethod(NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD), true);
  assert.equal(isNarsRuntimeServerMethod('session.submit'), false);
});

test('runtime contract builds credential-free intelligence reconfiguration frames', () => {
  assert.deepEqual(buildNarsRuntimeIntelligenceReconfigureFrame({
    provider: 'deepseek-api',
    model: 'deepseek-v4-flash',
    thinking: 'medium',
  }, { id: 'reconfigure-7' }), {
    id: 'reconfigure-7',
    method: 'runtime.intelligence.reconfigure',
    params: {
      request_id: 'reconfigure-7',
      provider: 'deepseek-api',
      model: 'deepseek-v4-flash',
      thinking: 'medium',
    },
  });
  assert.deepEqual(buildNarsRuntimeIntelligenceReconfigureFrame({ model: 'next-model' }, { id: 'model-only' }), {
    id: 'model-only',
    method: 'runtime.intelligence.reconfigure',
    params: { request_id: 'model-only', model: 'next-model' },
  });
  assert.equal(buildNarsRuntimeIntelligenceReconfigureFrame(), null);
  assert.equal(buildNarsRuntimeIntelligenceReconfigureFrame({ provider: '   ' }), null);
});

test('runtime contract builds a typed execution policy reconfiguration frame', () => {
  assert.deepEqual(buildNarsRuntimeExecutionPolicyReconfigureFrame({ max_rounds: 12 }, { id: 'policy-12' }), {
    id: 'policy-12',
    method: 'runtime.execution_policy.reconfigure',
    params: {
      request_id: 'policy-12',
      execution_policy: {
        schema: 'narada.nars.execution_policy.v1',
        scope: 'session',
        source: { kind: 'runtime-control', ref: null, revision: 1 },
        tool_loop: { max_rounds: 12 },
      },
    },
  });
  assert.equal(buildNarsRuntimeExecutionPolicyReconfigureFrame({ max_rounds: 500 }, { id: 'policy-500' })?.params.execution_policy.tool_loop.max_rounds, 500);
  assert.equal(buildNarsRuntimeExecutionPolicyReconfigureFrame({ max_rounds: 0 }), null);
  assert.equal(buildNarsRuntimeExecutionPolicyReconfigureFrame({ max_rounds: 501 }), null);
});
