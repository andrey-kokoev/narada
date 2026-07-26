import assert from 'node:assert/strict';
import test from 'node:test';
import { createCloudflareToolEffectAdapterBoundary } from './cloudflare-tool-effect-adapter.ts';

test('tool-effect boundary preserves capability-scoped adapter posture and execution contract', async () => {
  const adapter = createCloudflareToolEffectAdapterBoundary({
    env: { marker: 'env' },
    createImplementation: (env: any) => ({
      posture: 'configured',
      adapter_kind: 'fixture-tool-effect',
      supported_tools: ['fixture.read'],
      async execute(request: any) {
        return { ok: true, marker: env.marker, request };
      },
    }),
  });

  assert.equal(adapter.posture, 'configured');
  assert.deepEqual(await adapter.execute({ tool_name: 'fixture.read' }), {
    ok: true,
    marker: 'env',
    request: { tool_name: 'fixture.read' },
  });
});

test('tool-effect boundary remains absent when capability implementation is unavailable', () => {
  assert.equal(createCloudflareToolEffectAdapterBoundary({
    createImplementation: () => null,
  }), null);
});