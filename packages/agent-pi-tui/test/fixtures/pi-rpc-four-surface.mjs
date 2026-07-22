import { appendFileSync, existsSync } from 'node:fs';

const requestLogFile = process.env.PI_RPC_FIXTURE_REQUEST_LOG ?? process.argv[3] ?? null;
const artifactPath = process.env.PI_RPC_FIXTURE_ARTIFACT_PATH ?? process.argv[2] ?? null;
const holdReleasePath = process.env.PI_RPC_FIXTURE_HOLD_RELEASE_PATH ?? process.argv[4] ?? null;
const malformed = process.env.PI_RPC_FIXTURE_MALFORMED === '1';
let failureIssued = false;
let toolTurn = null;
let holdTurn = null;
let nextToolCall = 1;

function log(record) {
  if (requestLogFile) appendFileSync(requestLogFile, `${JSON.stringify(record)}\n`);
}

function send(record) {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function latestUser(params) {
  const messages = Array.isArray(params?.messages) ? params.messages : [];
  const message = [...messages].reverse().find((entry) => entry?.role === 'user');
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) {
    return message.content.map((part) => typeof part === 'string' ? part : part?.type === 'text' ? part.text : '').join('');
  }
  return '';
}

function respond(id, content, extra = {}) {
  const { narada_stream: stream, narada_artifacts: artifacts, ...resultExtra } = extra;
  send({
    id,
    result: {
      admission: 'acknowledged',
      transportSubmitted: true,
      ...resultExtra,
      response: {
        choices: [{ message: { role: 'assistant', content } }],
        ...(stream ? { narada_stream: stream } : {}),
        ...(artifacts ? { narada_artifacts: artifacts } : {}),
      },
      ...(stream ? { narada_stream: stream } : {}),
      ...(artifacts ? { narada_artifacts: artifacts } : {}),
    },
  });
}

function emitTool(turnId, toolName, argumentsValue) {
  const callId = `pi-four-tool-${nextToolCall++}`;
  send({
    type: 'event',
    event: {
      kind: 'tool_call',
      id: callId,
      tool_name: toolName,
      tool_call_id: callId,
      arguments: argumentsValue,
    },
  });
  return callId;
}

function completeTurn(id, prompt) {
  if (prompt.includes('PI_LIVE_STREAM')) {
    send({ type: 'event', event: { kind: 'assistant_token', id: `partial:${id}`, sequence: 1, content: 'PI_LIVE_STREAM_PARTIAL' } });
    send({ type: 'event', event: { kind: 'assistant_token', id: `final:${id}`, sequence: 2, content: 'PI_LIVE_STREAM_FINAL', done: true } });
    respond(id, 'PI_LIVE_STREAM_FINAL', {
      narada_stream: [
        { content: 'PI_LIVE_STREAM_PARTIAL', done: false, stream_id: 'pi-four-stream' },
        { content: 'PI_LIVE_STREAM_FINAL', done: true, stream_id: 'pi-four-stream' },
      ],
    });
    return;
  }
  if (prompt.includes('PI_LIVE_ORDINARY')) return respond(id, 'PI_LIVE_ORDINARY_ASSISTANT');
  if (prompt.includes('PI_LIVE_TOOL')) return respond(id, 'PI_LIVE_TOOL_ASSISTANT', {
    narada_artifacts: [{
      kind: 'html',
      title: 'PI_LIVE_ARTIFACT',
      content: '<!doctype html><h1>PI live generated artifact</h1>',
    }],
  });
  if (prompt.includes('PI_LIVE_HOLD')) return respond(id, 'PI_LIVE_HOLD_ASSISTANT');
  if (prompt.includes('PI_LIVE_STEER')) return respond(id, 'PI_LIVE_STEER_ASSISTANT');
  if (prompt.includes('PI_LIVE_FAILURE')) return respond(id, 'PI_LIVE_FAILURE_RECOVERED');
  if (prompt.includes('PI_LIVE_RECONNECT')) return respond(id, 'PI_LIVE_RECONNECT_ASSISTANT');
  respond(id, 'PI_LIVE_DEFAULT_ASSISTANT');
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
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      send({ error: { code: 'pi_rpc_fixture_invalid_request', message: 'invalid request JSON' } });
      continue;
    }
    log({ method: request.method, params: request.params ?? {} });
    if (malformed) {
      process.stdout.write('{not-json}\n');
      continue;
    }
    const params = request.params ?? {};
    if (request.type === 'tool_result' && toolTurn) {
      if (toolTurn.stage === 0) {
        toolTurn.stage = 1;
        emitTool(toolTurn.id, 'fixture_artifact', {
          path: artifactPath,
          content: '<!doctype html><h1>PI live generated artifact</h1>',
        });
      } else if (toolTurn.stage === 1) {
        toolTurn.stage = 2;
        emitTool(toolTurn.id, 'fixture_denied', {});
      } else {
        const current = toolTurn;
        toolTurn = null;
        completeTurn(current.id, 'PI_LIVE_TOOL');
      }
      continue;
    }
    if (request.method === 'start') {
      send({
        id: request.id,
        result: {
          negotiation: {
            pi_version: 'pi-four-surface-1.0.0',
            mode: 'rpc',
            capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
            supported_event_kinds: ['assistant_token', 'tool_call', 'tool_result', 'turn_complete'],
          },
        },
      });
      continue;
    }
    if (request.method === 'steer') {
      // Keep the active turn pending until the test releases the same
      // provider-equivalent hold. This preserves the queue/turn-boundary
      // observation while the cognition implementation is Pi RPC.
      respond(request.id, 'steer-accepted', { response: { accepted: true } });
      continue;
    }
    if (request.method === 'cancel') {
      respond(request.id, 'cancelled', { response: { accepted: true } });
      continue;
    }
    if (request.method === 'turn') {
      const prompt = latestUser(params);
      if (prompt.includes('PI_LIVE_FAILURE') && !failureIssued) {
        failureIssued = true;
        // Return an admitted terminal provider outcome rather than a JSON-RPC
        // transport error. This four-surface scenario checks failure
        // projection; retry admission is covered by the dedicated uncertain
        // transport live scenario. The RPC child never retries on its own.
        send({ id: request.id, result: {
          admission: 'acknowledged',
          transportSubmitted: true,
          error: { code: 'pi_four_provider_failure', message: 'PI_LIVE_PROVIDER_FAILURE', retryable: false },
        } });
        continue;
      }
      if (prompt.includes('PI_LIVE_TOOL') && !toolTurn) {
        toolTurn = { id: request.id, stage: 0 };
        emitTool(request.id, 'fixture_echo', { text: 'PI_LIVE_TOOL_ECHO' });
        continue;
      }
      if (prompt.includes('PI_LIVE_HOLD')) {
        holdTurn = { id: request.id };
        continue;
      }
      completeTurn(request.id, prompt);
      continue;
    }
    send({ id: request.id, result: { accepted: true, method: request.method } });
  }
});

const holdPoller = setInterval(() => {
  if (!holdTurn || !holdReleasePath || !existsSync(holdReleasePath)) return;
  const held = holdTurn;
  holdTurn = null;
  completeTurn(held.id, 'PI_LIVE_HOLD');
}, 25);
holdPoller.unref?.();
