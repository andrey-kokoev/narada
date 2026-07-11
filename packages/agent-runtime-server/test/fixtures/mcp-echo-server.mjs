import { existsSync, writeFileSync } from 'node:fs';

const disconnectMarker = process.argv[2] ?? null;
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
      if (disconnectMarker && !existsSync(disconnectMarker)) {
        writeFileSync(disconnectMarker, 'disconnected-once', 'utf8');
        process.exit(23);
      } else if (request.params.name === 'fixture_artifact') {
        writeFileSync(request.params.arguments.path, request.params.arguments.content, 'utf8');
        reply(request.id, { content: [{ type: 'text', text: request.params.arguments.path }] });
      } else reply(request.id, { content: [{ type: 'text', text: `echo:${request.params.arguments.text}` }] });
    }
  }
});
