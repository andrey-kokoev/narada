#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const SUPPORTED_ROLES = new Set(['owner', 'maintainer', 'viewer']);
const SUPPORTED_STATUSES = new Set(['active', 'inactive']);

export function parseSiteMembershipPutArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const memberPrincipalId = option(args, '--member-principal-id') ?? option(args, '--principal-id') ?? env.CLOUDFLARE_CARRIER_MEMBER_PRINCIPAL_ID ?? null;
  const role = normalizeRole(option(args, '--role') ?? env.CLOUDFLARE_CARRIER_MEMBERSHIP_ROLE ?? null);
  const status = normalizeStatus(option(args, '--membership-status') ?? option(args, '--status') ?? env.CLOUDFLARE_CARRIER_MEMBERSHIP_STATUS ?? 'active');
  const requestId = option(args, '--request-id') ?? `site_membership_put_${String(siteId ?? 'site').replace(/[^a-z0-9]+/gi, '_')}_${now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_SITE_MEMBERSHIP_PUT_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('site_membership_put_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('site_membership_put_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!memberPrincipalId) throw new Error('site_membership_put_requires_--member-principal-id_or_CLOUDFLARE_CARRIER_MEMBER_PRINCIPAL_ID');
  if (!role) throw new Error('site_membership_put_requires_--role_or_CLOUDFLARE_CARRIER_MEMBERSHIP_ROLE');
  if (!SUPPORTED_ROLES.has(role)) throw new Error(`site_membership_put_role_unsupported:${role}`);
  if (!SUPPORTED_STATUSES.has(status)) throw new Error(`site_membership_put_status_unsupported:${status}`);
  if (!['json', 'text'].includes(format)) throw new Error(`site_membership_put_format_unsupported:${format}`);
  if (!auth) throw new Error('site_membership_put_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      member_principal_id: memberPrincipalId,
      role,
      status,
    },
  };
}

export async function putCloudflareSiteMembership(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'site.membership.put',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`site_membership_put_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeSiteMembershipPut(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.site_membership_put.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: config.params,
    response: body,
    summary: summarizeSiteMembershipPut(body, config.params),
  };
}

export function summarizeSiteMembershipPut(body = {}, params = {}) {
  const membership = body?.membership ?? {};
  const principal = body?.principal ?? {};
  const decision = body?.site_authority_decision ?? null;
  return {
    site_id: membership.site_id ?? body?.site_id ?? params.site_id ?? null,
    member_principal_id: membership.principal_id ?? body?.member_principal_id ?? params.member_principal_id ?? null,
    membership_role: membership.role ?? body?.role ?? params.role ?? null,
    membership_status: membership.status ?? body?.status ?? params.status ?? null,
    actor_principal_id: principal.principal_id ?? null,
    actor_email: principal.email ?? null,
    decision_action: decision?.action ?? null,
    decision_reason: decision?.reason ?? null,
    authority_locus_kind: decision?.authority_locus_kind ?? null,
    updated_at: membership.updated_at ?? null,
  };
}

export function formatSiteMembershipPutText(result) {
  const summary = result?.summary ?? summarizeSiteMembershipPut(result?.response ?? {}, result?.params ?? {});
  const refused = result?.status === 'refused';
  const lines = [
    `Site Membership Put: ${refused ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    `Member: ${summary.member_principal_id ?? result?.params?.member_principal_id ?? 'unknown'}`,
    `Role: ${summary.membership_role ?? result?.params?.role ?? 'unknown'}`,
    `Status: ${summary.membership_status ?? result?.params?.status ?? 'unknown'}`,
  ];
  if (summary.actor_principal_id || summary.actor_email) {
    lines.push(`Actor: ${summary.actor_principal_id ?? 'unknown'}${summary.actor_email ? ` (${summary.actor_email})` : ''}`);
  }
  if (summary.decision_action || summary.authority_locus_kind) {
    lines.push(`Authority Decision: action=${summary.decision_action ?? 'unknown'} locus=${summary.authority_locus_kind ?? 'unknown'}${summary.decision_reason ? ` reason=${summary.decision_reason}` : ''}`);
  }
  if (summary.updated_at) lines.push(`Updated: ${summary.updated_at}`);
  return lines.join('\n') + '\n';
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function normalizeRole(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return text || null;
}

function normalizeStatus(value) {
  return String(value ?? '').trim().toLowerCase();
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
    const config = parseSiteMembershipPutArgs(process.argv.slice(2));
    const result = await putCloudflareSiteMembership(config);
    if (config.format === 'text') {
      process.stdout.write(formatSiteMembershipPutText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(formatSiteMembershipPutText({
        status: 'refused',
        worker_url: error.config.workerUrl,
        auth_source: error.config.auth?.source,
        params: error.config.params,
        response: error.response,
        summary: error.summary,
      }));
    } else {
      process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response }, null, 2) + '\n');
    }
    process.exit(1);
  }
}
