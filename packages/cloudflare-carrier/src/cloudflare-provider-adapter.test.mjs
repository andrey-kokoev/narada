import assert from 'node:assert/strict';
import test from 'node:test';
import { createCloudflareProviderAdapter } from './cloudflare-provider-adapter.mjs';

test('provider adapter refuses construction without a Workers AI binding', () => {
  assert.equal(createCloudflareProviderAdapter({}, {
    config: {
      bindings: { ai: null },
      capabilities: { intelligenceDiagnostics: false },
    },
  }), null);
});

test('diagnostic requests remain gated before canonical gateway or provider transport', async () => {
  let calls = 0;
  const adapter = createCloudflareProviderAdapter({
    AI: { async run() { calls += 1; return { response: 'unexpected' }; } },
  }, {
    config: {
      bindings: { ai: { async run() { calls += 1; return { response: 'unexpected' }; } } },
      capabilities: { intelligenceDiagnostics: false },
    },
  });

  await assert.rejects(
    adapter.run({
      input: { event_id: 'provider-adapter-diagnostic-gate', content: 'diagnostic' },
      intelligence_diagnostic: 'provider-failure',
    }),
    (error) => error.code === 'cloudflare_intelligence_diagnostic_disabled',
  );
  assert.equal(calls, 0);
});
