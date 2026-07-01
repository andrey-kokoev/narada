import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { buildAgentWebUiCloudflareAuthorityConfig, buildAgentWebUiCloudflareProjectionConfig } from '@narada2/cloudflare-nars-projection';
import { readProjectionRegistration, registerProjectionRemotely, startLocalProjectionBridgeOnce, startLocalProjectionBridgeRunProcess } from '@narada2/cloudflare-nars-projection/node';
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
    if (arg === '--cloudflare-authority-session-id' || arg === '--authority-session-id') {
      options.cloudflareAuthoritySessionId = args[index + 1] ?? null;
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

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function normalizeBaseUrl(value) {
  const raw = String(value ?? '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

const FORBIDDEN_PROJECTION_BODY_KEYS = new Set([
  'site_root', 'siteRoot', 'site_id', 'siteId', 'session', 'session_id', 'sessionId',
  'nars_session_id', 'narsSessionId', 'agent', 'agent_id', 'agentId',
]);

function assertNoProjectionAuthorityOverride(body) {
  for (const key of Object.keys(body ?? {})) {
    if (FORBIDDEN_PROJECTION_BODY_KEYS.has(key)) throw new Error(`projection_authority_override_refused:${key}`);
  }
}

function stringList(value) {
  if (Array.isArray(value)) return value.flatMap((entry) => String(entry).split(',')).map((entry) => entry.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return undefined;
}

function buildRemoteWebUrl(args) {
  const config = buildAgentWebUiCloudflareProjectionConfig({ projection_id: args.projectionId, api_base_url: args.cloudflareApiBaseUrl, browser_token_fingerprint: args.browserTokenFingerprint });
  const url = new URL(config.api_base_url);
  url.searchParams.set('cloudflare_projection_id', args.projectionId);
  url.searchParams.set('cloudflare_api_base_url', config.api_base_url);
  if (config.browser_token_fingerprint) url.searchParams.set('cloudflare_browser_token', config.browser_token_fingerprint);
  return url.toString();
}

async function defaultStartCloudflareProjection(args) {
  const registration = await registerProjectionRemotely({
    site_id: args.siteId,
    site_root: args.siteRoot,
    nars_session_id: args.sessionId,
    projection_id: args.projectionId,
    event_stream_policy: args.eventPolicy,
    operator_input_policy: args.inputPolicy,
    replica_cache_policy: args.cachePolicy,
    artifact_projection_policy: args.artifactPolicy,
    created_by: 'agent-web-ui',
    dry_run: false,
    cloudflare_api_base_url: args.cloudflareApiBaseUrl,
  });
  if (registration.status !== 'registered_remotely') {
    return {
      schema: 'narada.agent_web_ui.cloudflare_projection_start.v1',
      status: 'refused',
      reason: registration.status,
      projection_id: registration.projection_id ?? args.projectionId ?? null,
      registration,
    };
  }
  const projectionId = registration.projection_id;
  const browserTokenFingerprint = registration.remote_access?.browser_access_tokens?.[0]?.token_fingerprint ?? null;
  const bridgeOnce = await startLocalProjectionBridgeOnce({
    site_root: args.siteRoot,
    projection_id: projectionId,
    cloudflare_api_base_url: args.cloudflareApiBaseUrl,
  });
  const bridgeRun = startLocalProjectionBridgeRunProcess({
    site_root: args.siteRoot,
    projection_id: projectionId,
    cloudflare_api_base_url: args.cloudflareApiBaseUrl,
  });
  const remoteUrl = buildRemoteWebUrl({ projectionId, cloudflareApiBaseUrl: args.cloudflareApiBaseUrl, browserTokenFingerprint });
  return {
    schema: 'narada.agent_web_ui.cloudflare_projection_start.v1',
    status: bridgeOnce.status === 'refused' ? 'degraded' : 'published',
    projection_id: projectionId,
    remote_url: remoteUrl,
    browser_token_fingerprint: browserTokenFingerprint,
    cloudflare_api_base_url: args.cloudflareApiBaseUrl,
    registration_status: registration.status,
    bridge_once_status: bridgeOnce.status,
    bridge_run_status: bridgeRun.status,
    bridge_state: bridgeOnce.bridge_state ?? null,
    bridge_process: bridgeRun,
    state_path: registration.bridge_state_path ?? null,
  };
}

function buildProjectionStartInput(options, body) {
  if (!hasLocalProjectionAuthority(options)) throw new Error('projection_control_not_configured');
  assertNoProjectionAuthorityOverride(body);
  const cloudflareApiBaseUrl = normalizeBaseUrl(body.cloudflare_api_base_url ?? body.cloudflareApiBaseUrl ?? body.api_base_url ?? body.apiBaseUrl ?? options.cloudflareApiBaseUrl);
  if (!cloudflareApiBaseUrl) throw new Error('cloudflare_api_base_url_required');
  const artifactKinds = stringList(body.artifact_kind ?? body.artifactKind ?? body.artifact_kinds ?? body.artifactKinds);
  return {
    siteId: options.siteId,
    siteRoot: options.siteRoot,
    sessionId: options.sessionId,
    agentId: options.agentId ?? null,
    cloudflareApiBaseUrl,
    projectionId: body.projection_id ?? body.projectionId ?? undefined,
    eventPolicy: body.event_policy ?? body.eventPolicy ?? undefined,
    inputPolicy: stringList(body.input_verb ?? body.inputVerb ?? body.input_verbs ?? body.inputVerbs),
    cachePolicy: body.cache_policy ?? body.cachePolicy ?? undefined,
    artifactPolicy: body.artifact_content || body.artifactContent || artifactKinds ? {
      content: body.artifact_content ?? body.artifactContent ?? undefined,
      allowed_kinds: artifactKinds,
      redact_local_paths: true,
    } : undefined,
  };
}

function buildProjectionStatus(options, projectionId) {
  if (!hasLocalProjectionAuthority(options)) return { schema: 'narada.agent_web_ui.cloudflare_projection_status.v1', status: 'not_configured' };
  if (!projectionId) return { schema: 'narada.agent_web_ui.cloudflare_projection_status.v1', status: 'no_projection_selected' };
  const registration = readProjectionRegistration(options.siteRoot, projectionId);
  return {
    schema: 'narada.agent_web_ui.cloudflare_projection_status.v1',
    status: registration.intent ? 'known' : 'not_found',
    projection_id: projectionId,
    site_id: options.siteId,
    session_id: options.sessionId,
    bridge_state: registration.bridge_state,
    state_path: registration.paths.bridge_state_path,
  };
}

function hasLocalProjectionAuthority(options) {
  return Boolean(options.sessionId && options.siteRoot && options.siteId);
}

export function buildClientConfig(options) {
  if (options.cloudflareAuthoritySessionId && options.cloudflareApiBaseUrl) {
    const config = buildAgentWebUiCloudflareAuthorityConfig({ session_id: options.cloudflareAuthoritySessionId, api_base_url: options.cloudflareApiBaseUrl });
    return {
      cloudflareAuthoritySessionId: options.cloudflareAuthoritySessionId,
      cloudflareApiBaseUrl: options.cloudflareApiBaseUrl,
      authoritySessionId: options.cloudflareAuthoritySessionId,
      apiBaseUrl: options.cloudflareApiBaseUrl,
      eventEndpoint: config.event_endpoint,
      healthEndpoint: config.health_endpoint,
      inputEndpoint: config.input_endpoint,
      cacheEndpoint: config.cache_endpoint,
      healthTransport: 'cloudflare-authority',
      artifactBasePath: config.artifact_base_path,
      artifactTransport: 'cloudflare-authority',
      protocolHealthMethod: 'session.health',
      maxReplay: 100,
      operatorInput: true,
      admittedMethods: [...AGENT_WEB_UI_NARS_METHOD_LIST],
    };
  }
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
    projectionControl: hasLocalProjectionAuthority(options) ? {
      cloudflare: {
        available: true,
        startEndpoint: '/api/projections/cloudflare/start',
        statusEndpoint: '/api/projections/cloudflare/status',
        defaultApiBaseUrl: normalizeBaseUrl(options.cloudflareApiBaseUrl),
      },
    } : null,
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

export function createAgentWebUiServer(options, deps = {}) {
  const clientConfig = buildClientConfig(options);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (url.pathname === '/api/projections/cloudflare/start') {
      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'method_not_allowed' });
        return;
      }
      try {
        const body = await readJsonBody(request);
        const input = buildProjectionStartInput(options, body);
        const startProjection = deps.startCloudflareProjection ?? defaultStartCloudflareProjection;
        const result = await startProjection(input);
        sendJson(response, result.status === 'refused' ? 400 : 200, result);
      } catch (error) {
        sendJson(response, 400, { schema: 'narada.agent_web_ui.cloudflare_projection_start.v1', status: 'refused', reason: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    if (url.pathname === '/api/projections/cloudflare/status') {
      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'method_not_allowed' });
        return;
      }
      try {
        sendJson(response, 200, buildProjectionStatus(options, url.searchParams.get('projection_id') ?? url.searchParams.get('projectionId')));
      } catch (error) {
        sendJson(response, 400, { schema: 'narada.agent_web_ui.cloudflare_projection_status.v1', status: 'refused', reason: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
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

export function startAgentWebUiServer(options, deps = {}) {
  const server = createAgentWebUiServer(options, deps);
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
