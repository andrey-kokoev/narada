import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import readline from 'node:readline';

const malformed = process.env.PI_RPC_FIXTURE_MALFORMED === '1';
const crashOnceFile = process.env.PI_RPC_FIXTURE_CRASH_ONCE_FILE;
const requestLogFile = process.env.PI_RPC_FIXTURE_REQUEST_LOG;
const toolCallEnabled = process.env.PI_RPC_FIXTURE_TOOL_CALL === '1';
const authError = process.env.PI_RPC_FIXTURE_AUTH_ERROR === '1';
const dropResponse = process.env.PI_RPC_FIXTURE_DROP_RESPONSE === '1';
const assistantContent = process.env.PI_RPC_FIXTURE_ASSISTANT_CONTENT ?? 'rpc-ok';
let pendingToolTurnId = null;
const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  const request = JSON.parse(line);
  if (requestLogFile) appendFileSync(requestLogFile, `${JSON.stringify({ method: request.method, params: request.params ?? {} })}\n`);
  if (malformed) {
    process.stdout.write('{not-json}\n');
    return;
  }
  if (request.type === 'tool_result' && pendingToolTurnId) {
    const turnId = pendingToolTurnId;
    pendingToolTurnId = null;
    process.stdout.write(`${JSON.stringify({ id: turnId, result: { admission: 'acknowledged', transportSubmitted: true, response: { choices: [{ message: { role: 'assistant', content: 'rpc-tool-ok' } }] }, tool_result: request.result } })}\n`);
    return;
  }
  if (request.method === 'start') {
    process.stdout.write(`${JSON.stringify({ id: request.id, result: {
      negotiation: {
        pi_version: process.env.PI_RPC_FIXTURE_VERSION ?? 'fixture-1.0.0',
        mode: 'rpc',
        capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
        supported_event_kinds: ['assistant_token', 'tool_call', 'tool_result', 'turn_complete'],
      },
    } })}\n`);
    return;
  }
  if (request.method === 'turn') {
    if (crashOnceFile && !existsSync(crashOnceFile)) {
      writeFileSync(crashOnceFile, 'crashed\n');
      process.exit(23);
    }
    if (toolCallEnabled) {
      pendingToolTurnId = request.id;
      process.stdout.write(`${JSON.stringify({ type: 'event', event: { kind: 'tool_call', id: 'rpc-tool-call-1', tool_name: 'rpc_read', tool_call_id: 'rpc-tool-call-1', arguments: { value: 'fixture' } } })}\n`);
      return;
    }
    if (dropResponse) return;
    if (authError) {
      process.stdout.write(`${JSON.stringify({ id: request.id, error: { code: 'provider_auth_failed', message: 'fixture authentication rejected' } })}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify({ type: 'event', event: { kind: 'assistant_token', id: `token:${request.id}`, sequence: 1, content: 'ok' } })}\n`);
    process.stdout.write(`${JSON.stringify({ id: request.id, result: { admission: 'acknowledged', transportSubmitted: true, response: { choices: [{ message: { role: 'assistant', content: assistantContent } }] } } })}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify({ id: request.id, result: { accepted: true, method: request.method } })}\n`);
});
