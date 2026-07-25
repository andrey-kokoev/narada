import { appendFileSync } from 'node:fs';

const reportPath: any = process.env.PI_RPC_FIXTURE_COMPACTION_REPORT ?? process.argv[2] ?? null;
const version: any = 'pi-compaction-reconstruction-1.0.0';

function log(record: any) {
  if (reportPath) appendFileSync(reportPath, `${JSON.stringify(record)}\n`);
}

function send(record: any) {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function latestUser(params: any) {
  const messages: any = Array.isArray(params?.messages) ? params.messages : [];
  const message: any = [...messages].reverse().find((entry: any) => entry?.role === 'user');
  return typeof message?.content === 'string' ? message.content : '';
}

function respond(id: any, content: any, extra: any = {}) {
  const { narada_compaction: compaction, ...resultExtra }: any = extra;
  const response: any = {
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
let buffer: any = '';
process.stdin.on('data', (chunk: any) => {
  buffer += chunk;
  while (true) {
    const newline: any = buffer.indexOf('\n');
    if (newline < 0) break;
    const line: any = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const request: any = JSON.parse(line);
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
      const prompt: any = latestUser(request.params);
      const messages: any = JSON.stringify(request.params?.messages ?? []);
      const reconstructed: any = messages.includes('GAP_COMPACTION_ASSISTANT');
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
