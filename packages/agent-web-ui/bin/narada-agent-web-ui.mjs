#!/usr/bin/env node
import { createServer } from 'node:http';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_WEB_UI_NARS_METHOD_LIST } from '@narada2/nars-client-projection-contract';

const STATIC_ROOT = new URL('../src/', import.meta.url);
const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
]);

export function parseAgentWebUiArgs(args = []) {
  const options = { host: '127.0.0.1', port: 0, eventEndpoint: null, healthEndpoint: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--host') {
      options.host = args[index + 1] ?? options.host;
      index += 1;
      continue;
    }
    if (arg === '--port') {
      options.port = Number.parseInt(args[index + 1] ?? '0', 10) || 0;
      index += 1;
      continue;
    }
    if (arg === '--event-endpoint') {
      options.eventEndpoint = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--health-endpoint') {
      options.healthEndpoint = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

export function buildClientConfig(options) {
  return {
    eventEndpoint: options.eventEndpoint ?? null,
    healthEndpoint: options.healthEndpoint ? '/api/health' : null,
    maxReplay: 100,
    operatorInput: true,
    admittedMethods: [...AGENT_WEB_UI_NARS_METHOD_LIST],
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readStaticFile(pathname, clientConfig) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (relativePath.includes('..')) return null;
  const fileUrl = new URL(relativePath, STATIC_ROOT);
  if (!fileUrl.href.startsWith(STATIC_ROOT.href)) return null;
  let content = await readFile(fileUrl, 'utf8');
  if (relativePath === 'index.html') {
    content = content.replace('__NARADA_AGENT_WEB_UI_CONFIG__', JSON.stringify(clientConfig));
  }
  return { content, contentType: CONTENT_TYPES.get(extname(relativePath)) ?? 'text/plain; charset=utf-8' };
}

export function createAgentWebUiServer(options) {
  const clientConfig = buildClientConfig(options);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    if (url.pathname === '/api/config') {
      sendJson(response, 200, clientConfig);
      return;
    }
    if (url.pathname === '/api/health') {
      if (!options.healthEndpoint) {
        sendJson(response, 400, { error: 'health_endpoint_not_configured' });
        return;
      }
      try {
        const upstream = await fetch(options.healthEndpoint, { method: 'GET' });
        const body = await upstream.text();
        response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8' });
        response.end(body);
      } catch (error) {
        sendJson(response, 502, { error: 'health_endpoint_unavailable', message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    try {
      const file = await readStaticFile(url.pathname, clientConfig);
      if (!file) {
        sendJson(response, 404, { error: 'not_found' });
        return;
      }
      response.writeHead(200, { 'content-type': file.contentType });
      response.end(file.content);
    } catch {
      sendJson(response, 404, { error: 'not_found' });
    }
  });
  return server;
}

export function startAgentWebUiServer(options) {
  const server = createAgentWebUiServer(options);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      resolve({ server, url: `http://${options.host}:${port}/` });
    });
  });
}

function printHelp() {
  console.log(`narada-agent-web-ui --event-endpoint <ws-url> [--health-endpoint <http-url>] [--host 127.0.0.1] [--port 0]\n\nStarts a browser operator surface over one NARS session. The web UI subscribes to events, submits ordinary text as conversation.send, and projects slash commands into NARS protocol frames.`);
}

async function main() {
  const options = parseAgentWebUiArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = await startAgentWebUiServer(options);
  console.log(`agent-web-ui: ${result.url}`);
  console.log(`  Events  ${options.eventEndpoint ?? 'not configured'}`);
  console.log(`  Health  ${options.healthEndpoint ?? 'not configured'}`);
  console.log('  Input   conversation.send + slash commands');
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
