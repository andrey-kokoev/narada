import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMcpOutputReader,
  normalizeRuntimeMcpTools,
  sendMcpRequest,
} from './mcp-runtime.mjs';

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
