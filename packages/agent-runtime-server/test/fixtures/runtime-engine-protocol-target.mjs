const runtimeEngine = process.env.NARADA_RUNTIME_ENGINE ?? 'node';

function emit(event, payload = {}) {
  process.stdout.write(`${JSON.stringify({
    schema: 'narada.runtime_engine_protocol_probe.v1',
    event,
    runtime_engine_kind: runtimeEngine,
    ...payload,
  })}\n`);
}

emit('session_started', { lifecycle_state: 'ready' });

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  let newline;
  while ((newline = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, newline).trim();
    input = input.slice(newline + 1);
    if (!line) continue;
    const request = JSON.parse(line);
    if (request.method === 'session.health') {
      emit('session_health', { request_id: request.id, status: 'healthy', lifecycle_state: 'ready' });
    } else if (request.method === 'mcp.tools.list') {
      emit('mcp_tools', { request_id: request.id, tools: ['probe'] });
    } else if (request.method === 'session.close') {
      emit('session_closed', { request_id: request.id, lifecycle_state: 'closed' });
      process.exit(0);
    }
  }
});
