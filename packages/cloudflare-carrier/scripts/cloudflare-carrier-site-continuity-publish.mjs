#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

export function parseSiteContinuityPublishArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_SITE_CONTINUITY_PUBLISH_REQUEST_ID ?? `site_continuity_packet_publish_${siteId ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_SITE_CONTINUITY_PUBLISH_FORMAT ?? 'json';
  const operatorSessionFile = option(args, '--operator-session-file') ?? env.CLOUDFLARE_OPERATOR_SESSION_FILE ?? null;
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('site_continuity_publish_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('site_continuity_publish_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!['json', 'text'].includes(format)) throw new Error(`site_continuity_publish_format_unsupported:${format}`);
  if (!auth) throw new Error('site_continuity_publish_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    operatorSessionFile,
    auth,
    params: { site_id: siteId },
  };
}

export async function publishCloudflareSiteContinuityPacket(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'site.continuity.packet.publish',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`site_continuity_publish_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeSiteContinuityPublish(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.site_continuity_publish.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    operator_session_file: config.operatorSessionFile ?? null,
    auth_source: config.auth.source,
    params: config.params,
    response: body,
    summary: summarizeSiteContinuityPublish(body, config.params),
  };
}

export function summarizeSiteContinuityPublish(body = {}, params = {}) {
  const packet = body?.packet ?? {};
  const admission = body?.site_continuity_packet_admission ?? {};
  const record = body?.packet_record ?? {};
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    site_id: body.site_id ?? params.site_id ?? packet.site_id ?? null,
    status: body.status ?? null,
    packet_id: packet.packet_id ?? null,
    source_embodiment_kind: packet.source_embodiment_kind ?? null,
    target_embodiment_kind: packet.target_embodiment_kind ?? null,
    packet_admission_action: admission.action ?? null,
    packet_admission_reason: admission.reason ?? null,
    durability_action: record.durability_action ?? null,
    imported_at: record.imported_at ?? null,
    previous_imported_at: record.previous_imported_at ?? null,
    imported_by_principal_id: record.imported_by_principal_id ?? null,
  };
}

export function formatSiteContinuityPublishText(result) {
  const summary = result?.summary ?? summarizeSiteContinuityPublish(result?.response ?? {}, result?.params ?? {});
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  const lines = [
    `Site Continuity Publish: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    ...(summary.status ? [`Status: ${summary.status}`] : []),
    ...(summary.packet_id ? [`Packet: ${summary.packet_id}`] : []),
    ...((summary.source_embodiment_kind || summary.target_embodiment_kind)
      ? [`Direction: ${summary.source_embodiment_kind ?? 'unknown'} -> ${summary.target_embodiment_kind ?? 'unknown'}`]
      : []),
    ...(summary.packet_admission_action ? [`Admission: ${summary.packet_admission_action}${summary.packet_admission_reason ? ` reason=${summary.packet_admission_reason}` : ''}`] : []),
    ...(summary.durability_action ? [`Durability: ${summary.durability_action}`] : []),
    ...(summary.imported_at ? [`Imported At: ${summary.imported_at}`] : []),
    ...(summary.previous_imported_at ? [`Previous Imported At: ${summary.previous_imported_at}`] : []),
    ...(summary.imported_by_principal_id ? [`Imported By: ${summary.imported_by_principal_id}`] : []),
  ];

  const worker = result?.worker_url ?? null;
  const sessionFile = result?.operator_session_file ?? null;
  if (worker && sessionFile && summary.site_id) {
    const baseArgs = `-- --url ${worker} --site ${summary.site_id} --operator-session-file ${sessionFile}`;
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text ${baseArgs}`);
    lines.push(`Operation List: pnpm --filter @narada2/cloudflare-carrier product:operation:list:text ${baseArgs}`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${worker} --operator-session-file ${sessionFile} --execute-site-next`);
  }

  return lines.join('\n') + '\n';
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function normalizeWorkerUrl(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseSiteContinuityPublishArgs(process.argv.slice(2));
    const result = await publishCloudflareSiteContinuityPacket(config);
    if (config.format === 'text') {
      process.stdout.write(formatSiteContinuityPublishText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(
        formatSiteContinuityPublishText({
          status: 'refused',
          worker_url: error.config.workerUrl,
          auth_source: error.config.auth?.source,
          params: error.config.params,
          response: error.response,
          summary: error.summary,
        }),
      );
    } else {
      process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response, summary: error?.summary }, null, 2) + '\n');
    }
    process.exit(1);
  }
}
