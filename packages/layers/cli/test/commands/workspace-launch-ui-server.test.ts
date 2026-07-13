import { describe, expect, it } from 'vitest';
import {
  closeWorkspaceLaunchUiServer,
  createWorkspaceLaunchUiServer,
  listenWorkspaceLaunchUiServer,
} from '../../src/commands/workspace-launch-ui-server.js';

async function requestJson(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, init);
  return { status: response.status, body: await response.json() };
}

describe('workspace launch UI server', () => {
  it('owns shared HTTP routes and delegates launch semantics to the controller', async () => {
    const calls: Array<unknown> = [];
    const server = createWorkspaceLaunchUiServer({
      page: () => '<html>Narada Workspace Launch</html>',
      asset: (pathname) => pathname === '/assets/test.js'
        ? { body: Buffer.from('console.log(1);'), contentType: 'text/javascript; charset=utf-8' }
        : null,
      selectorModel: (payload) => {
        calls.push(['selector-model', payload]);
        return { selected: payload };
      },
      dashboard: () => ({ schema: 'narada.workspace_launch.ui_session_state.v1', status: 'open' }),
      submit: (payload) => {
        calls.push(['submit', payload]);
        return { status: 202, payload: { accepted: true, payload } };
      },
      action: (launchAttemptId, action) => {
        calls.push(['action', launchAttemptId, action]);
        return { status: 200, payload: { launchAttemptId, action } };
      },
      cancel: () => ({ status: 200, payload: { status: 'closed' }, close: true }),
    });
    const listening = await listenWorkspaceLaunchUiServer(server, '127.0.0.1', {
      port: 0,
      fallbackToEphemeral: false,
      source: 'explicit',
    });

    try {
      const root = await fetch(listening.url);
      expect(root.status).toBe(200);
      await expect(root.text()).resolves.toContain('Narada Workspace Launch');

      const asset = await fetch(`${listening.url}/assets/test.js`);
      expect(asset.status).toBe(200);
      expect(asset.headers.get('content-type')).toContain('text/javascript');
      await expect(asset.text()).resolves.toBe('console.log(1);');

      await expect(requestJson(`${listening.url}/launches`)).resolves.toMatchObject({
        status: 200,
        body: { schema: 'narada.workspace_launch.ui_session_state.v1', status: 'open' },
      });
      await expect(requestJson(`${listening.url}/selector-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: ['sonar'] }),
      })).resolves.toMatchObject({ status: 200, body: { selected: { site: ['sonar'] } } });
      await expect(requestJson(`${listening.url}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: ['resident'] }),
      })).resolves.toMatchObject({ status: 202, body: { accepted: true } });
      await expect(requestJson(`${listening.url}/launches/attempt-1/recheck`, { method: 'POST' })).resolves.toEqual({
        status: 200,
        body: { launchAttemptId: 'attempt-1', action: 'recheck' },
      });
      await expect(requestJson(`${listening.url}/missing`)).resolves.toEqual({ status: 404, body: { error: 'not_found' } });
      await expect(requestJson(`${listening.url}/cancel`, { method: 'POST' })).resolves.toEqual({
        status: 200,
        body: { status: 'closed' },
      });

      expect(calls).toEqual([
        ['selector-model', { site: ['sonar'] }],
        ['submit', { role: ['resident'] }],
        ['action', 'attempt-1', 'recheck'],
      ]);
    } finally {
      await closeWorkspaceLaunchUiServer(server);
    }
  });
});
