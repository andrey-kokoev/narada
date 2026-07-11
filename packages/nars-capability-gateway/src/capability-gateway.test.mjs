import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarsCapabilityGateway } from './capability-gateway.mjs';

function createGateway({ admit = async () => ({ admitted: true }) } = {}) {
  const evidence = [];
  const requests = [];
  const servers = { filesystem: { tools: [{ name: 'fs_read_file', inputSchema: { type: 'object' } }] } };
  const gateway = createNarsCapabilityGateway({
    siteRoot: 'C:/site',
    admit,
    recordEvidence: async (item) => evidence.push(item),
    dependencies: {
      discoverAndStartMcpServers: async () => servers,
      aggregateToolBindings: (items) => [{ serverName: 'filesystem', server: { ...items.filesystem, name: 'filesystem' }, tool: items.filesystem.tools[0], providerToolName: 'fs_read_file' }],
      findToolBinding: () => ({ server: { ...servers.filesystem, name: 'filesystem' }, tool: servers.filesystem.tools[0] }),
      sendMcpRequest: async (_server, request) => { requests.push(request); return { content: [{ type: 'text', text: 'ok' }] }; },
    },
  });
  return { gateway, evidence, requests };
}

test('capability gateway dispatches admitted tools with evidence', async () => {
  const { gateway, evidence, requests } = createGateway();
  assert.equal((await gateway.start())[0].tool_name, 'fs_read_file');
  const result = await gateway.invoke({ toolName: 'fs_read_file', arguments: { path: 'README.md' } });
  assert.equal(result.status, 'completed');
  assert.deepEqual(requests[0].params, { name: 'fs_read_file', arguments: { path: 'README.md' } });
  assert.equal(evidence[0].kind, 'tool_execution_completed');
});

test('capability gateway refuses tools before dispatch when admission rejects', async () => {
  const { gateway, evidence, requests } = createGateway({ admit: async () => ({ admitted: false, reason: 'approval_required' }) });
  const result = await gateway.invoke({ toolName: 'fs_read_file' });
  assert.equal(result.status, 'refused');
  assert.equal(requests.length, 0);
  assert.equal(evidence[0].kind, 'tool_execution_refused');
});
