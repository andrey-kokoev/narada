import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NARS_RUNTIME_EXECUTION_POLICY_RECONFIGURE_METHOD,
  NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD,
  NARS_RUNTIME_SERVER_METHOD_LIST,
  buildNarsRuntimeExecutionPolicyReconfigureFrame,
  buildNarsRuntimeIntelligenceReconfigureFrame,
  isNarsRuntimeServerMethod,
} from './nars-runtime-contract.js';

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

test('runtime contract builds admitted intelligence reconfiguration frames', () => {
  assert.deepEqual(buildNarsRuntimeIntelligenceReconfigureFrame({
    inferenceProvider: 'deepseek-api',
    model: 'deepseek-v4-flash',
    requestedOptions: { thinking: 'medium' },
  }, { id: 'reconfigure-7' }), {
    id: 'reconfigure-7',
    method: 'runtime.intelligence.reconfigure',
    params: {
      request_id: 'reconfigure-7',
      requested_inference_provider: { kind: 'inference-provider', id: 'inference-provider:deepseek-api' },
      requested_model: { kind: 'model', id: 'model:deepseek-v4-flash' },
      requested_options: { thinking: 'medium' },
    },
  });
  assert.deepEqual(buildNarsRuntimeIntelligenceReconfigureFrame({
    requested_inference_provider: { kind: 'inference-provider', id: 'inference-provider:kimi-code-api' },
    requested_model: { kind: 'model', id: 'model:k3' },
    requested_options: {},
  }, { id: 'complete-empty-options' }), {
    id: 'complete-empty-options',
    method: 'runtime.intelligence.reconfigure',
    params: {
      request_id: 'complete-empty-options',
      requested_inference_provider: { kind: 'inference-provider', id: 'inference-provider:kimi-code-api' },
      requested_model: { kind: 'model', id: 'model:k3' },
      requested_options: {},
    },
  });
  assert.equal(buildNarsRuntimeIntelligenceReconfigureFrame(), null);
  assert.equal(buildNarsRuntimeIntelligenceReconfigureFrame({ model: 'next-model' }), null);
  assert.equal(buildNarsRuntimeIntelligenceReconfigureFrame({ inferenceProvider: 'deepseek-api' }), null);
  assert.equal(buildNarsRuntimeIntelligenceReconfigureFrame({ inferenceProvider: 'deepseek-api', model: 'next-model', thinking: 'medium' }), null);
  assert.equal(buildNarsRuntimeIntelligenceReconfigureFrame({ provider: 'deepseek-api' }), null);
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
