const mode = process.argv[2] ?? 'success';
process.stdin.setEncoding('utf8');
let buffer = '';
const reply = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline === -1) return;
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    const request = JSON.parse(line);
    if (request.method === 'initialize') reply(request.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} } });
    else if (request.method === 'tools/list') reply(request.id, { tools: [{ name: 'fixture_tool', inputSchema: { type: 'object' } }] });
    else if (request.method === 'tools/call') {
      if (mode === 'exit') process.exit(21);
      else if (mode === 'malformed') process.stdout.write('{malformed}\n');
      else if (mode !== 'timeout') reply(request.id, { content: [{ type: 'text', text: 'ok' }] });
    }
  }
});
