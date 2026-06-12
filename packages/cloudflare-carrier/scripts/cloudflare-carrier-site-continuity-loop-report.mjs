#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

export async function parseSiteContinuityLoopReportArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const reportFile = option(args, '--report-file') ?? env.CLOUDFLARE_SITE_CONTINUITY_LOOP_REPORT_FILE ?? null;
  const requestId =
    option(args, '--request-id')
    ?? env.CLOUDFLARE_SITE_CONTINUITY_LOOP_REPORT_REQUEST_ID
    ?? `site_continuity_loop_report_put_${siteId ?? now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_SITE_CONTINUITY_LOOP_REPORT_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('site_continuity_loop_report_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('site_continuity_loop_report_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!reportFile) throw new Error('site_continuity_loop_report_requires_--report-file_or_CLOUDFLARE_SITE_CONTINUITY_LOOP_REPORT_FILE');
  if (!['json', 'text'].includes(format)) throw new Error(`site_continuity_loop_report_format_unsupported:${format}`);
  if (!auth) throw new Error('site_continuity_loop_report_requires_bearer_token_or_operator_session');

  const report = await loadSiteContinuityLoopReport(reportFile);
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('site_continuity_loop_report_file_missing_report_object');
  }
  if (!report.site_id) {
    throw new Error('site_continuity_loop_report_file_missing_site_id');
  }
  if (report.site_id !== siteId) {
    throw new Error(`site_continuity_loop_report_site_id_mismatch:${siteId}:${report.site_id}`);
  }

  return {
    workerUrl,
    reportFile,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      report,
    },
  };
}

export async function loadSiteContinuityLoopReport(reportFile) {
  const parsed = parseJsonText(await readFile(reportFile, 'utf8'));
  if (parsed?.continuity_loop_report && typeof parsed.continuity_loop_report === 'object') {
    return parsed.continuity_loop_report;
  }
  return parsed;
}

export async function putSiteContinuityLoopReport(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'site.continuity.loop.report.put',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`site_continuity_loop_report_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeSiteContinuityLoopReport(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.site_continuity_loop_report_put.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    report_file: config.reportFile,
    params: config.params,
    response: body,
    summary: summarizeSiteContinuityLoopReport(body, config.params),
  };
}

export function summarizeSiteContinuityLoopReport(body = {}, params = {}) {
  const reportRecord = body?.report_record ?? {};
  const report = params?.report ?? {};
  const cloudflarePush = report?.cloudflare_push ?? {};
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    site_id: reportRecord.site_id ?? body.site_id ?? params.site_id ?? report.site_id ?? null,
    status: body.status ?? reportRecord.status ?? report.status ?? null,
    loop_report_id: reportRecord.report_id ?? report.loop_report_id ?? report.report_id ?? null,
    generated_at: reportRecord.generated_at ?? report.generated_at ?? null,
    recorded_at: reportRecord.recorded_at ?? null,
    recorded_by_principal_id: reportRecord.recorded_by_principal_id ?? null,
    freshness_state: report.freshness_state ?? null,
    freshness_reason: report.freshness_reason ?? null,
    cloudflare_source: reportRecord.cloudflare_source ?? report.cloudflare_source ?? null,
    cloudflare_push_status: reportRecord.cloudflare_push_status ?? cloudflarePush.status ?? null,
    windows_packet_count: reportRecord.windows_packet_count ?? report.windows_packet_count ?? null,
    imported_at: cloudflarePush.imported_at ?? null,
    previous_imported_at: cloudflarePush.previous_imported_at ?? null,
    durability_action: cloudflarePush.durability_action ?? null,
  };
}

export function formatSiteContinuityLoopReportText(result) {
  const summary = result?.summary ?? summarizeSiteContinuityLoopReport(result?.response ?? {}, result?.params ?? {});
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  return [
    `Site Continuity Loop Report: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    ...(summary.status ? [`Status: ${summary.status}`] : []),
    ...(summary.loop_report_id ? [`Loop Report: ${summary.loop_report_id}`] : []),
    ...(summary.generated_at ? [`Generated At: ${summary.generated_at}`] : []),
    ...(summary.recorded_at ? [`Recorded At: ${summary.recorded_at}`] : []),
    ...(summary.recorded_by_principal_id ? [`Recorded By: ${summary.recorded_by_principal_id}`] : []),
    ...(summary.freshness_state ? [`Freshness State: ${summary.freshness_state}`] : []),
    ...(summary.freshness_reason ? [`Freshness Reason: ${summary.freshness_reason}`] : []),
    ...(summary.cloudflare_source ? [`Cloudflare Source: ${summary.cloudflare_source}`] : []),
    ...(summary.cloudflare_push_status ? [`Cloudflare Push: ${summary.cloudflare_push_status}`] : []),
    ...(summary.windows_packet_count != null ? [`Windows Packets: ${summary.windows_packet_count}`] : []),
    ...(summary.imported_at ? [`Imported At: ${summary.imported_at}`] : []),
    ...(summary.previous_imported_at ? [`Previous Imported At: ${summary.previous_imported_at}`] : []),
    ...(summary.durability_action ? [`Durability: ${summary.durability_action}`] : []),
  ].join('\n') + '\n';
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
    const config = await parseSiteContinuityLoopReportArgs(process.argv.slice(2));
    const result = await putSiteContinuityLoopReport(config);
    if (config.format === 'text') {
      process.stdout.write(formatSiteContinuityLoopReportText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(
        formatSiteContinuityLoopReportText({
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
