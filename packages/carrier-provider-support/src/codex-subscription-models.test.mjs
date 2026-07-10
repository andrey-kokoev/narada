import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCodexSubscriptionModelCatalog } from './codex-subscription-models.mjs';

test('Codex subscription catalog projects fresh selectable cache models in priority order', () => {
  const result = resolveCodexSubscriptionModelCatalog({
    processEnv: { NARADA_CODEX_AUTH_HOME: 'C:\\codex' },
    fallbackModels: ['fallback'],
    now: Date.parse('2026-07-09T23:00:00Z'),
    readFile: () => JSON.stringify({
      fetched_at: '2026-07-09T22:00:00Z',
      models: [
        { slug: 'hidden', visibility: 'hide', priority: 0 },
        { slug: 'second', visibility: 'list', priority: 2 },
        { slug: 'first', visibility: 'list', priority: 1 },
      ],
    }),
  });
  assert.deepEqual(result.models, ['first', 'second']);
  assert.equal(result.source, 'live_codex_cache');
  assert.equal(result.fallback_reason, null);
});

test('Codex subscription catalog labels stale cache fallback explicitly', () => {
  const result = resolveCodexSubscriptionModelCatalog({
    processEnv: { NARADA_CODEX_AUTH_HOME: 'C:\\codex' },
    fallbackModels: ['fallback'],
    now: Date.parse('2026-07-11T23:00:00Z'),
    readFile: () => JSON.stringify({ fetched_at: '2026-07-09T22:00:00Z', models: [] }),
  });
  assert.deepEqual(result.models, ['fallback']);
  assert.equal(result.source, 'declared_registry_fallback');
  assert.equal(result.fallback_reason, 'cache_missing_fresh_timestamp');
});
