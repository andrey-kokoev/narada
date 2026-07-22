import { existsSync, writeFileSync } from 'node:fs';

const disconnectMarker = process.argv[2] ?? null;
const deniedSideEffectMarker = process.env.NARADA_MCP_FIXTURE_DENIED_MARKER ?? null;
const toolDelayMs = Math.max(
  0,
  Number(process.argv[3] ?? process.env.NARADA_MCP_FIXTURE_TOOL_DELAY_MS ?? 0) || 0,
);
const malformedResponse = process.env.NARADA_MCP_FIXTURE_MALFORMED === '1';
const malformedMarker = process.env.NARADA_MCP_FIXTURE_MALFORMED_MARKER ?? null;
process.stdin.setEncoding('utf8');
let buffer = '';
function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline === -1) return;
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    const request = JSON.parse(line);
    if (request.method === 'initialize') reply(request.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} } });
    else if (request.method === 'tools/list') reply(request.id, { tools: [
      { name: 'fixture_echo', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
      { name: 'fixture_artifact', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
      { name: 'fixture_denied', inputSchema: { type: 'object', properties: {} } },
    ] });
    else if (request.method === 'tools/call') {
      if (malformedResponse) {
        if (malformedMarker) writeFileSync(malformedMarker, 'malformed-response-emitted', 'utf8');
        process.stdout.write('not-json\\n');
        return;
      }
      const respond = () => {
        if (disconnectMarker && !existsSync(disconnectMarker)) {
          writeFileSync(disconnectMarker, 'disconnected-once', 'utf8');
          process.exit(23);
        } else if (request.params.name === 'fixture_artifact') {
          writeFileSync(request.params.arguments.path, request.params.arguments.content, 'utf8');
          reply(request.id, { content: [{ type: 'text', text: request.params.arguments.path }] });
        } else if (request.params.name === 'fixture_denied') {
          if (deniedSideEffectMarker) writeFileSync(deniedSideEffectMarker, 'denied-tool-executed', 'utf8');
          reply(request.id, { content: [{ type: 'text', text: 'denied-fixture-reached' }] });
        } else reply(request.id, { content: [{ type: 'text', text: `echo:${request.params.arguments.text}` }] });
      };
      if (toolDelayMs > 0) setTimeout(respond, toolDelayMs);
      else respond();
    }
  }
});
