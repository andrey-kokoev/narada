import { createServer } from 'node:http';
import {
  admitLoopTrigger,
  getLoopHealth,
  getLoopRun,
  getLoopStatus,
  listLoopRuntimeEvents,
  listLoopRuns,
  listLoopTriggers,
  setLoopControl,
} from './site-loop-store.mjs';

export const SITE_OPERATING_LOOP_HTTP_SERVER_SCHEMA = 'narada.site_operating_loop.http_server.v1';

export function createSiteOperatingLoopHttpServer(store, {
  loopId,
  allowOrigin = null,
  streamPollMs = 1000,
  streamHeartbeatMs = 15_000,
} = {}) {
  if (!loopId) throw new Error('loopId is required');

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'POST') {
        await handlePost({ request, response, url, store, loopId, allowOrigin });
        return;
      }
      if (request.method !== 'GET') {
        sendJson(response, 405, { schema: 'narada.site_operating_loop.http_error.v1', status: 'refused', reason: 'method_not_allowed' }, { allowOrigin });
        return;
      }

      if (url.pathname === '/health') {
        sendJson(response, 200, getLoopHealth(store, loopId), { allowOrigin });
      } else if (url.pathname === '/status') {
        sendJson(response, 200, getLoopStatus(store, { loopId }), { allowOrigin });
      } else if (url.pathname === '/events') {
        sendJson(response, 200, listLoopRuntimeEvents(store, {
          loopId,
          afterEventId: url.searchParams.get('after_event_id'),
          limit: Number(url.searchParams.get('limit') ?? 50),
        }), { allowOrigin });
      } else if (url.pathname === '/events/stream') {
        if (url.searchParams.get('snapshot') === '1') {
          sendEventStreamSnapshot(response, listLoopRuntimeEvents(store, {
            loopId,
            afterEventId: url.searchParams.get('after_event_id'),
            limit: Number(url.searchParams.get('limit') ?? 50),
          }).events, { allowOrigin });
        } else {
          sendLiveEventStream({
            request,
            response,
            store,
            loopId,
            afterEventId: url.searchParams.get('after_event_id'),
            limit: Number(url.searchParams.get('limit') ?? 50),
            allowOrigin,
            pollMs: Number(url.searchParams.get('poll_ms') ?? streamPollMs),
            heartbeatMs: Number(url.searchParams.get('heartbeat_ms') ?? streamHeartbeatMs),
          });
        }
      } else if (url.pathname === '/triggers') {
        sendJson(response, 200, listLoopTriggers(store, {
          loopId,
          status: url.searchParams.get('status'),
          limit: Number(url.searchParams.get('limit') ?? 50),
        }), { allowOrigin });
      } else if (url.pathname === '/runs') {
        sendJson(response, 200, {
          schema: 'narada.site_operating_loop.runs.v1',
          loop_id: loopId,
          runs: listLoopRuns(store, { loopId, limit: Number(url.searchParams.get('limit') ?? 10) }),
        }, { allowOrigin });
      } else if (url.pathname.startsWith('/runs/')) {
        const runId = decodeURIComponent(url.pathname.slice('/runs/'.length));
        const run = getLoopRun(store, runId);
        sendJson(response, run ? 200 : 404, {
          schema: 'narada.site_operating_loop.run_show.v1',
          status: run ? 'ok' : 'not_found',
          run,
        }, { allowOrigin });
      } else {
        sendJson(response, 404, { schema: 'narada.site_operating_loop.http_error.v1', status: 'not_found', reason: 'unknown_path' }, { allowOrigin });
      }
    } catch (error) {
      sendJson(response, 500, {
        schema: 'narada.site_operating_loop.http_error.v1',
        status: 'failed',
        error: {
          name: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error),
        },
      }, { allowOrigin });
    }
  });
}

async function handlePost({ request, response, url, store, loopId, allowOrigin }) {
  if (url.pathname === '/triggers') {
    const body = await readJsonBody(request);
    if (!body.kind) {
      sendJson(response, 400, { schema: 'narada.site_operating_loop.http_error.v1', status: 'refused', reason: 'kind_required' }, { allowOrigin });
      return;
    }
    sendJson(response, 202, admitLoopTrigger(store, {
      loopId,
      kind: body.kind,
      source: body.source ?? 'http',
      sourceRef: body.source_ref ?? body.sourceRef ?? null,
      payload: body.payload ?? null,
      triggerId: body.trigger_id ?? body.triggerId ?? null,
    }), { allowOrigin });
  } else if (url.pathname === '/control/pause') {
    const body = await readJsonBody(request, { optional: true });
    sendJson(response, 200, setLoopControl(store, {
      loopId,
      paused: true,
      mode: 'paused',
      reason: body.reason ?? 'http_requested',
    }), { allowOrigin });
  } else if (url.pathname === '/control/resume') {
    const body = await readJsonBody(request, { optional: true });
    sendJson(response, 200, setLoopControl(store, {
      loopId,
      paused: false,
      mode: 'running',
      reason: body.reason ?? 'http_requested',
    }), { allowOrigin });
  } else {
    sendJson(response, 404, { schema: 'narada.site_operating_loop.http_error.v1', status: 'not_found', reason: 'unknown_path' }, { allowOrigin });
  }
}

export async function listenSiteOperatingLoopHttpServer(server, { host = '127.0.0.1', port = 0 } = {}) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  return {
    schema: SITE_OPERATING_LOOP_HTTP_SERVER_SCHEMA,
    status: 'listening',
    host,
    port: typeof address === 'object' && address ? address.port : port,
    base_url: `http://${host}:${typeof address === 'object' && address ? address.port : port}`,
  };
}

function sendJson(response, statusCode, body, { allowOrigin }) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  if (allowOrigin) response.setHeader('access-control-allow-origin', allowOrigin);
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

async function readJsonBody(request, { optional = false } = {}) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text && optional) return {};
  if (!text) return {};
  return JSON.parse(text);
}

function sendEventStreamSnapshot(response, events, { allowOrigin }) {
  response.statusCode = 200;
  response.setHeader('content-type', 'text/event-stream; charset=utf-8');
  response.setHeader('cache-control', 'no-cache');
  if (allowOrigin) response.setHeader('access-control-allow-origin', allowOrigin);
  for (const event of events) {
    response.write(`event: ${event.event}\n`);
    response.write(`id: ${event.event_id}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  response.end();
}

function sendLiveEventStream({ request, response, store, loopId, afterEventId, limit, allowOrigin, pollMs, heartbeatMs }) {
  response.statusCode = 200;
  response.setHeader('content-type', 'text/event-stream; charset=utf-8');
  response.setHeader('cache-control', 'no-cache');
  response.setHeader('connection', 'keep-alive');
  if (allowOrigin) response.setHeader('access-control-allow-origin', allowOrigin);
  response.write(': connected\n\n');

  let cursor = afterEventId || null;
  let closed = false;
  let lastHeartbeatAt = Date.now();
  const pollIntervalMs = Math.max(50, Number(pollMs) || 1000);
  const heartbeatIntervalMs = Math.max(250, Number(heartbeatMs) || 15_000);

  const close = () => {
    closed = true;
    clearInterval(timer);
  };
  request.on('close', close);
  response.on('close', close);

  const flush = () => {
    if (closed) return;
    const page = listLoopRuntimeEvents(store, { loopId, afterEventId: cursor, limit });
    for (const event of page.events) {
      writeSseEvent(response, event);
      cursor = event.event_id;
    }
    const now = Date.now();
    if (now - lastHeartbeatAt >= heartbeatIntervalMs) {
      response.write(`: heartbeat ${new Date(now).toISOString()}\n\n`);
      lastHeartbeatAt = now;
    }
  };

  const timer = setInterval(flush, pollIntervalMs);
  flush();
}

function writeSseEvent(response, event) {
  response.write(`event: ${event.event}\n`);
  response.write(`id: ${event.event_id}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}
