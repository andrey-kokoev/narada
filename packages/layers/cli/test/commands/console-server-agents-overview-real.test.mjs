import test from 'node:test';
import assert from 'node:assert/strict';
import { createConsoleServer } from '../../dist/commands/console-server.js';

test('GET /console/agents/api/overview includes every Site returned by the real Site Registry', async () => {
  const server = await createConsoleServer({ port: 0, host: '127.0.0.1' });
  const url = await server.start();
  try {
    const registryResponse = await fetch(`${url}/console/registry/api/sites`);
    assert.equal(registryResponse.status, 200);
    const registryBody = await registryResponse.json();
    const expectedSiteIds = registryBody.sites.map((site) => site.site_id).sort();

    const overviewResponse = await fetch(`${url}/console/agents/api/overview`);
    assert.equal(overviewResponse.status, 200);
    const overviewBody = await overviewResponse.json();
    assert.equal(overviewBody.schema, 'narada.operator_console.site_agent_overview.v1');
    assert.equal(overviewBody.status, 'success');

    const overviewSiteIds = overviewBody.groups
      .flatMap((group) => group.sites.map((site) => site.site_id))
      .sort();

    for (const siteId of expectedSiteIds) {
      assert.ok(overviewSiteIds.includes(siteId), `expected site ${siteId} in overview`);
    }
  } finally {
    await server.stop();
  }
});
