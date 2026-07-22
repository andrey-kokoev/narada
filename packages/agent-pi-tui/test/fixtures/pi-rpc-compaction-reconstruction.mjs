import { appendFileSync } from 'node:fs';

const reportPath = process.env.PI_RPC_FIXTURE_COMPACTION_REPORT ?? process.argv[2] ?? null;
const version = 'pi-compaction-reconstruction-1.0.0';

function log(record) {
  if (reportPath) appendFileSync(reportPath, `${JSON.stringify(record)}\n`);
}

function send(record) {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function latestUser(params) {
  const messages = Array.isArray(params?.messages) ? params.messages : [];
  const message = [...messages].reverse().find((entry) => entry?.role === 'user');
  return typeof message?.content === 'string' ? message.content : '';
}

function respond(id, content, extra = {}) {
  const { narada_compaction: compaction, ...resultExtra } = extra;
  const response = {
    choices: [{ message: { role: 'assistant', content } }],
    ...(compaction ? { narada_compaction: compaction } : {}),
  };
  send({
    id,
    result: {
      admission: 'acknowledged',
      transportSubmitted: true,
      ...resultExtra,
      response,
      ...(compaction ? { narada_compaction: compaction } : {}),
    },
  });
}

process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) break;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const request = JSON.parse(line);
    if (request.method === 'start') {
      log({ type: 'start', cwd: process.cwd() });
      send({
        id: request.id,
        result: {
          negotiation: {
            pi_version: version,
            mode: 'rpc',
            capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
            supported_event_kinds: ['assistant_token', 'tool_call', 'tool_result', 'turn_complete'],
          },
        },
      });
      continue;
    }
    if (request.method === 'turn') {
      const prompt = latestUser(request.params);
      const messages = JSON.stringify(request.params?.messages ?? []);
      const reconstructed = messages.includes('GAP_COMPACTION_ASSISTANT');
      log({ type: 'turn', prompt, reconstructed_context: reconstructed, message_count: request.params?.messages?.length ?? 0 });
      if (prompt.includes('GAP_COMPACTION')) {
        respond(request.id, 'GAP_COMPACTION_ASSISTANT', {
          narada_compaction: {
            retained_context_cursor: 'cursor:compaction:1',
            summary_digest: 'sha256:pi-live-compaction-summary',
            token_estimate: 42,
          },
        });
      } else if (prompt.includes('GAP_RECONSTRUCTION')) {
        respond(request.id, reconstructed ? 'GAP_RECONSTRUCTION_ASSISTANT' : 'GAP_RECONSTRUCTION_MISSING');
      } else {
        respond(request.id, 'PI_COMPACTION_DEFAULT');
      }
      continue;
    }
    respond(request.id, 'PI_COMPACTION_DEFAULT');
  }
});
