import { createInterface } from 'node:readline';

const TOOL_NAME = 'full_live_tool_probe';

const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  if (!line.trim()) return;
  const request = JSON.parse(line);
  const result = respond(request);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
});

function respond(request: any) {
  switch (request.method) {
    case 'initialize':
      return {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'full-live-tool-mcp', version: '1.0.0' },
      };
    case 'tools/list':
      return {
        tools: [{
          name: TOOL_NAME,
          description: 'Deterministic live E2E probe tool.',
          inputSchema: {
            type: 'object',
            properties: { marker: { type: 'string' } },
            additionalProperties: false,
          },
        }],
      };
    case 'tools/call':
      if (request.params?.name !== TOOL_NAME) {
        return {
          isError: true,
          content: [{ type: 'text', text: `unknown_tool:${String(request.params?.name ?? '')}` }],
        };
      }
      return {
        isError: false,
        content: [{ type: 'text', text: 'full_live_tool_probe ok' }],
      };
    default:
      return {
        isError: true,
        content: [{ type: 'text', text: `unsupported_method:${String(request.method ?? '')}` }],
      };
  }
}
