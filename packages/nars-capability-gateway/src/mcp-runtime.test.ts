import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateToolBindings,
  applyWorkerMcpProjection,
  createRuntimeMcpServer,
  findToolBinding,
  normalizeMcpOutputReader,
  normalizeRuntimeMcpTools,
  projectWorkerMcpFabricServers,
  providerToolNameForOriginal,
  sendMcpRequest,
} from './mcp-runtime.js';

type AnyRecord = Record<string, any>;

test('runtime represents a surface factory without spawning a per-session child', async () => {
  const server = await createRuntimeMcpServer({
    siteRoot: 'C:/site',
    serverName: 'launcher',
    serverConfig: {
      surface_projection: {
        surface_id: 'launcher',
        projection_id: 'factory',
        execution: { adapter: 'surface_factory', tenancy: 'authority_shared', replacement: 'generation_swap' },
        surface_descriptor: {
          tools: [{ name: 'launcher_doctor', description: 'Doctor', input_schema: { type: 'object', properties: {} } }],
        },
      },
    },
  });

  assert.equal(server.process, null);
  assert.equal(server.execution_adapter, 'surface_factory');
  assert.deepEqual(server.tools.map((tool: AnyRecord) => ({ name: tool.name, inputSchema: tool.inputSchema })), [{
    name: 'launcher_doctor',
    inputSchema: { type: 'object', properties: {} },
  }]);
  await assert.rejects(server.send({}), /mcp_surface_factory_requires_site_service_dispatch/);
});

test('runtime canonicalizes the agent-context output reader alias', () => {
  const tools = normalizeRuntimeMcpTools([
    { name: 'agent_context_output_show', description: 'legacy reader' },
    { name: 'agent_context_startup_sequence' },
  ]);

  assert.deepEqual(tools, [
    {
      name: 'mcp_output_show',
      runtime_tool_name: 'agent_context_output_show',
      description: 'legacy reader',
    },
    { name: 'agent_context_startup_sequence' },
  ]);
});

test('runtime worker MCP projection keeps only explicitly allowlisted tools', () => {
  const projected = applyWorkerMcpProjection({
    task_lifecycle: {
      tools: [{ name: 'task_lifecycle_show' }, { name: 'task_lifecycle_claim' }],
    },
    filesystem: {
      tools: [{ name: 'fs_read_file' }],
    },
  }, {
    native_mcp_mode: 'scoped',
    mcp_tool_allowlist: ['task_lifecycle_show'],
    include_startup_tools: false,
    include_output_readback_tools: false,
  });

  assert.deepEqual(projected.task_lifecycle.tools.map((tool: AnyRecord) => tool.name), ['task_lifecycle_show']);
  assert.equal(projected.filesystem, undefined);
});

test('runtime worker MCP preflight excludes servers without an admitted declared tool', () => {
  const projected = projectWorkerMcpFabricServers({
    sop: { tools: ['sop_run_status'] },
    worker: { tools: ['worker_run'] },
    mailbox: { tools: ['mailbox_fact_show'] },
    agent_context: { tools: ['agent_context_startup_sequence', 'agent_context_doctor'] },
  }, {
    native_mcp_mode: 'scoped',
    mcp_tool_allowlist: ['mailbox_fact_show'],
    include_startup_tools: true,
    include_output_readback_tools: false,
  });

  assert.deepEqual(Object.keys(projected), ['mailbox', 'agent_context']);
});

test('runtime normalizes reader metadata in structured and serialized MCP output', async () => {
  const response = await sendMcpRequest({
    send: async () => ({
      result: {
        reader_tool: 'agent_context_output_show',
        read_command: 'agent_context_output_show({"ref":"mcp_output:o_test"})',
        content: [{
          type: 'text',
          text: JSON.stringify({
            reader_tool: 'agent_context_output_show',
            remediation: 'Call agent_context_output_show with the returned ref.',
          }),
        }],
      },
    }),
  }, { method: 'tools/call' });

  assert.equal(response.reader_tool, 'mcp_output_show');
  assert.equal(response.read_command, 'mcp_output_show({"ref":"mcp_output:o_test"})');
  assert.deepEqual(JSON.parse(response.content[0].text), {
    reader_tool: 'mcp_output_show',
    remediation: 'Call mcp_output_show with the returned ref.',
  });
});

test('runtime preserves duplicate tool names as qualified bindings and refuses ambiguous original lookup', () => {
  const mcpServers = {
    user_site_feedback: {
      locus: 'user-site',
      tools: [{ name: 'feedback_submit' }, { name: 'user_only_tool' }],
    },
    local_site_feedback: {
      locus: 'local-site',
      tools: [{ name: 'feedback_submit' }],
    },
  };

  const bindings = aggregateToolBindings(mcpServers);
  assert.deepEqual(bindings.map(({ serverName, tool, providerToolName }) => ({
    serverName,
    originalToolName: tool.name,
    providerToolName,
  })), [
    {
      serverName: 'user_site_feedback',
      originalToolName: 'feedback_submit',
      providerToolName: 'mcp__user_site_feedback__feedback_submit',
    },
    {
      serverName: 'user_site_feedback',
      originalToolName: 'user_only_tool',
      providerToolName: 'user_only_tool',
    },
    {
      serverName: 'local_site_feedback',
      originalToolName: 'feedback_submit',
      providerToolName: 'mcp__local_site_feedback__feedback_submit',
    },
  ]);

  assert.equal(providerToolNameForOriginal('feedback_submit', mcpServers), null);
  assert.equal(findToolBinding('feedback_submit', mcpServers), null);
  assert.equal(findToolBinding('user_only_tool', mcpServers)?.server.name, 'user_site_feedback');
  assert.equal(
    findToolBinding('mcp__local_site_feedback__feedback_submit', mcpServers)?.server.name,
    'local_site_feedback',
  );
});
