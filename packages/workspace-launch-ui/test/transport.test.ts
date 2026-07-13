import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWorkspaceLaunchTransport,
  normalizeWorkspaceLaunchBasePath,
} from '../src/launcher/transport.ts';

const selection = {
  site: ['smart-scheduling'],
  role: ['resident'],
  operatorSurface: ['agent-cli'],
  runtime: 'codex',
  intelligenceProvider: 'codex-subscription',
  selectionMode: {
    site: 'single' as const,
    role: 'single' as const,
    operatorSurface: 'single' as const,
  },
};

const selectorModel = {
  schema: 'narada.workspace_launch.selector_model.v1' as const,
  siteOptions: [{ value: 'smart-scheduling', label: 'Smart Scheduling' }],
  roleOptions: [{ value: 'resident', label: 'Resident' }],
  operatorSurfaceOptions: [{ value: 'agent-cli', label: 'Agent CLI' }],
  runtimeOptions: [{ value: 'codex', label: 'Codex' }],
  intelligenceProviderOptions: [{ value: 'codex-subscription', label: 'Codex Subscription' }],
  selected: selection,
};

test('normalizes launcher mount paths without changing endpoint ownership', () => {
  assert.equal(normalizeWorkspaceLaunchBasePath(''), '');
  assert.equal(normalizeWorkspaceLaunchBasePath('/'), '');
  assert.equal(normalizeWorkspaceLaunchBasePath(' /console/launch/ '), '/console/launch');
});

test('routes every launcher operation through the configured base path', async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, method: init?.method || 'GET' });
    const pathname = new URL(url, 'http://localhost').pathname;
    const payload = pathname.endsWith('/selector-model')
      ? selectorModel
      : pathname.endsWith('/launches')
        ? { schema: 'narada.workspace_launch.ui_session_state.v1', attempts: [] }
        : pathname.endsWith('/cancel')
          ? { status: 'cancelled' }
          : pathname.includes('/launches/')
            ? { status: 'rechecked', dashboard: { attempts: [] } }
            : { status: 'accepted' };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const transport = createWorkspaceLaunchTransport({
    basePath: '/console/launch/',
    fetchImpl,
  });

  assert.equal((await transport.selectorModel(selection)).payload?.schema, selectorModel.schema);
  assert.deepEqual((await transport.launches()).payload?.attempts, []);
  assert.equal((await transport.submit(selection)).payload?.status, 'accepted');
  assert.equal((await transport.action('attempt/1', 'recheck')).payload?.status, 'rechecked');
  assert.equal((await transport.cancel()).payload?.status, 'cancelled');

  assert.deepEqual(calls, [
    { url: '/console/launch/selector-model', method: 'POST' },
    { url: '/console/launch/launches', method: 'GET' },
    { url: '/console/launch/submit', method: 'POST' },
    { url: '/console/launch/launches/attempt%2F1/recheck', method: 'POST' },
    { url: '/console/launch/cancel', method: 'POST' },
  ]);
});

test('returns a null payload for an invalid response envelope', async () => {
  const fetchImpl: typeof fetch = async () => new Response('not-json', { status: 200 });
  const transport = createWorkspaceLaunchTransport({ fetchImpl });
  const response = await transport.cancel();
  assert.equal(response.ok, true);
  assert.equal(response.payload, null);
});
