#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseSiteScopeReadArgs(argv = [], env = process.env) {
  return parseProductReadArgs(['--operation', 'site.read', ...argv], env);
}

export async function readSiteScope(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.site_scope_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeSiteScope(product.response),
    response: product.response,
  };
}

export function summarizeSiteScope(body = {}) {
  const site = body?.site ?? {};
  const status = body?.site_product_status ?? body?.product_status ?? {};
  return {
    site_id: site?.site_id ?? body?.site_id ?? null,
    display_name: site?.display_name ?? null,
    status: site?.status ?? null,
    scope_loaded: Boolean(site?.site_id ?? body?.site_id),
    health: status?.health ?? null,
    next_action: status?.next_action ?? null,
    operation_count: Array.isArray(body?.operations) ? body.operations.length : 0,
    membership_count: Array.isArray(body?.memberships) ? body.memberships.length : 0,
    authority_count: (Array.isArray(body?.authority_events) ? body.authority_events.length : 0)
      + (Array.isArray(body?.site_authority?.decisions) ? body.site_authority.decisions.length : 0),
    persistence_state: status?.cloudflare_persistence_posture?.state ?? body?.cloudflare_persistence_posture?.state ?? null,
    recovery_state: status?.cloudflare_recovery_posture?.state ?? body?.cloudflare_recovery_posture?.state ?? null,
  };
}

export function formatSiteScopeReadText(result) {
  const summary = result?.summary ?? {};
  const lines = [
    'Site Scope: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}${summary.display_name ? ` (${summary.display_name})` : ''}`,
    `Scope Loaded: ${summary.scope_loaded ? 'yes' : 'no'}`,
    `Posture: health=${summary.health ?? 'unknown'} next=${summary.next_action ?? 'none'} status=${summary.status ?? 'unknown'}`,
    `Inventory: operations=${summary.operation_count ?? 0} memberships=${summary.membership_count ?? 0} authority=${summary.authority_count ?? 0}`,
    `Durability: persistence=${summary.persistence_state ?? 'unknown'} recovery=${summary.recovery_state ?? 'unknown'}`,
  ];
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseSiteScopeReadArgs(process.argv.slice(2));
    const result = await readSiteScope(config);
    if (config.format === 'text') {
      process.stdout.write(formatSiteScopeReadText(result));
    } else if (config.format === 'summary') {
      process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response }, null, 2) + '\n');
    process.exit(1);
  }
}
