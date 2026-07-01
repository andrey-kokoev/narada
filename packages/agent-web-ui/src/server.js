import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { AGENT_WEB_UI_NARS_METHOD_LIST } from '@narada2/nars-client-projection-contract';

const STATIC_ROOT = new URL('./', import.meta.url);
const DIST_ROOT = new URL('../dist/', import.meta.url);
const VENDOR_MODULES = new Map([
  ['vendor/nars-client-projection-contract.js', new URL('../../nars-client-projection-contract/src/nars-client-projection-contract.mjs', import.meta.url)],
  ['vendor/vue.js', new URL('../node_modules/vue/dist/vue.esm-browser.prod.js', import.meta.url)],
]);
const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
]);
const BROWSER_IMPORT_REWRITES = new Map([
  ['@narada2/nars-client-projection-contract', './vendor/nars-client-projection-contract.js'],
  ['vue', './vendor/vue.js'],
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
    if (arg === '--cloudflare-projection-id' || arg === '--projection-id') {
      options.cloudflareProjectionId = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--cloudflare-api-base-url' || arg === '--api-base-url') {
      options.cloudflareApiBaseUrl = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

export function buildClientConfig(options) {
  if (options.cloudflareProjectionId && options.cloudflareApiBaseUrl) {
    return {
      cloudflareProjectionId: options.cloudflareProjectionId,
      cloudflareApiBaseUrl: options.cloudflareApiBaseUrl,
      projectionId: options.cloudflareProjectionId,
      apiBaseUrl: options.cloudflareApiBaseUrl,
      healthTransport: 'cloudflare-projection',
      artifactBasePath: `${String(options.cloudflareApiBaseUrl).replace(/\/+$/, '')}/api/nars/projections/${encodeURIComponent(options.cloudflareProjectionId)}/artifacts`,
      artifactTransport: 'cloudflare-projection',
      protocolHealthMethod: 'session.health',
      maxReplay: 100,
      operatorInput: true,
      admittedMethods: [...AGENT_WEB_UI_NARS_METHOD_LIST],
    };
  }
  return {
    eventEndpoint: options.eventEndpoint ?? null,
    healthEndpoint: options.healthEndpoint ? '/api/health' : null,
    healthTransport: options.healthEndpoint ? 'http-proxy' : 'not-configured',
    artifactBasePath: options.healthEndpoint ? '/api/nars' : null,
    artifactTransport: 'local-nars-proxy',
    protocolHealthMethod: 'session.health',
    maxReplay: 100,
    operatorInput: true,
    admittedMethods: [...AGENT_WEB_UI_NARS_METHOD_LIST],
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function tryReadStaticRoot(root, relativePath) {
  const fileUrl = new URL(relativePath, root);
  if (!fileUrl.href.startsWith(root.href)) return null;
  try {
    return { content: await readFile(fileUrl, 'utf8') };
  } catch {
    return null;
  }
}

async function readStaticFile(pathname, clientConfig) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (relativePath.includes('..')) return null;
  const vendorModule = VENDOR_MODULES.get(relativePath);
  if (vendorModule) {
    return { content: await readFile(vendorModule, 'utf8'), contentType: CONTENT_TYPES.get(extname(relativePath)) ?? 'text/javascript; charset=utf-8' };
  }

  const distFile = await tryReadStaticRoot(DIST_ROOT, relativePath);
  if (distFile) {
    const content = relativePath === 'index.html' ? distFile.content.replace('__NARADA_AGENT_WEB_UI_CONFIG__', JSON.stringify(clientConfig)) : distFile.content;
    return { content, contentType: CONTENT_TYPES.get(extname(relativePath)) ?? 'text/plain; charset=utf-8' };
  }

  const sourceRelativePath = relativePath === 'index.html' ? 'compat-index.html' : relativePath;
  const sourceFile = await tryReadStaticRoot(STATIC_ROOT, sourceRelativePath);
  if (!sourceFile) return null;
  let content = sourceFile.content;
  if (sourceRelativePath === 'compat-index.html') {
    content = content.replace('__NARADA_AGENT_WEB_UI_CONFIG__', JSON.stringify(clientConfig));
  } else if (sourceRelativePath.endsWith('.js')) {
    for (const [from, to] of BROWSER_IMPORT_REWRITES) {
      content = content.replaceAll(`'${from}'`, `'${to}'`).replaceAll(`"${from}"`, `"${to}"`);
    }
  }
  return { content, contentType: CONTENT_TYPES.get(extname(sourceRelativePath)) ?? 'text/plain; charset=utf-8' };
}

export function createAgentWebUiServer(options) {
  const clientConfig = buildClientConfig(options);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    if (url.pathname.startsWith('/api/nars/')) {
      if (!options.healthEndpoint) {
        sendJson(response, 400, { error: 'nars_endpoint_not_configured' });
        return;
      }
      try {
        const upstreamBase = new URL(options.healthEndpoint);
        const upstreamPath = url.pathname.replace(/^\/api\/nars/, '');
        const upstreamUrl = new URL(upstreamPath + url.search, upstreamBase.origin);
        const upstream = await fetch(upstreamUrl, { method: 'GET' });
        const body = await upstream.arrayBuffer();
        response.writeHead(upstream.status, {
          'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
          ...(upstream.headers.get('content-security-policy') ? { 'content-security-policy': upstream.headers.get('content-security-policy') } : {}),
          ...(upstream.headers.get('x-narada-artifact-id') ? { 'x-narada-artifact-id': upstream.headers.get('x-narada-artifact-id') } : {}),
          ...(upstream.headers.get('x-narada-artifact-kind') ? { 'x-narada-artifact-kind': upstream.headers.get('x-narada-artifact-kind') } : {}),
        });
        response.end(Buffer.from(body));
      } catch (error) {
        sendJson(response, 502, { error: 'nars_endpoint_unavailable', message: error instanceof Error ? error.message : String(error) });
      }
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
    const file = await readStaticFile(url.pathname, clientConfig);
    if (!file) {
      sendJson(response, 404, { error: 'not_found' });
      return;
    }
    response.writeHead(200, { 'content-type': file.contentType });
    response.end(file.content);
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
