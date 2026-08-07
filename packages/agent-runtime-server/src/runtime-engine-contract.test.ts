import assert from 'node:assert/strict';
import test from 'node:test';
import { createNarsRuntimeContext } from './runtime-context.js';

test('runtime context carries the selected process engine as session evidence', () => {
  const context: any = createNarsRuntimeContext({
    identity: 'narada.test',
    session: 'runtime-engine-contract',
    siteRoot: 'C:/narada-test-site',
    runtimeEngineKind: 'rust',
    intelligenceKernelKind: 'narada-native',
  });

  assert.equal(context.runtimeEngineKind, 'rust');
  assert.equal(context.runtime_engine_kind, 'rust');
});
