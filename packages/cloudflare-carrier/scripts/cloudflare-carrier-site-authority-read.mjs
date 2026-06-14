#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseSiteAuthorityReadArgs(argv = [], env = process.env) {
  return parseProductReadArgs(['--operation', 'site.read', ...argv], env);
}

export async function readSiteAuthority(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.site_authority_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeSiteAuthority(product.response),
    response: product.response,
  };
}

export function summarizeSiteAuthority(body = {}) {
  const siteAuthority = body?.site_authority ?? {};
  const map = siteAuthority?.map ?? {};
  const decisions = Array.isArray(siteAuthority?.decisions) ? siteAuthority.decisions : [];
  const focusedWorkflowRoute = body?.focused_operation_lifecycle?.workflow_route ?? null;
  return {
    site_id: body?.site?.site_id ?? body?.site_id ?? map?.site_id ?? null,
    active_operation_id: body?.focused_operation_lifecycle?.operation_id ?? body?.operation?.operation_id ?? null,
    active_operation_next_action: focusedWorkflowRoute?.next_action ?? null,
    active_operation_focus_kind: focusedWorkflowRoute?.focus_kind ?? null,
    active_operation_focus_ref: focusedWorkflowRoute?.focus_ref ?? focusedWorkflowRoute?.target ?? null,
    classifier_version: map?.classifier_version ?? null,
    embodiment_count: Array.isArray(map?.embodiments) ? map.embodiments.length : 0,
    entry_count: Array.isArray(map?.entries) ? map.entries.length : 0,
    decision_count: decisions.length,
    admitted_count: decisions.filter((item) => item?.action === 'admit').length,
    refused_count: decisions.filter((item) => item?.action === 'refuse').length,
    projection_only_count: decisions.filter((item) => item?.action === 'projection_only').length,
    next_action: body?.site_product_status?.next_action ?? null,
    health: body?.site_product_status?.health ?? null,
    mutation_classes: Array.isArray(map?.entries) ? map.entries.map((item) => item?.mutation_class).filter(Boolean) : [],
    authority_loci: Array.isArray(map?.entries) ? map.entries.map((item) => item?.authority_locus).filter(Boolean) : [],
  };
}

export function formatSiteAuthorityReadText(result) {
  const summary = result?.summary ?? {};
  const lines = [
    'Site Authority: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Authority Map: classifier=${summary.classifier_version ?? 'unknown'} embodiments=${summary.embodiment_count ?? 0} entries=${summary.entry_count ?? 0}`,
    `Decisions: total=${summary.decision_count ?? 0} admitted=${summary.admitted_count ?? 0} refused=${summary.refused_count ?? 0} projection_only=${summary.projection_only_count ?? 0}`,
    `Posture: health=${summary.health ?? 'unknown'} next=${summary.next_action ?? 'none'}`,
  ];
  if ((summary.mutation_classes ?? []).length > 0) {
    lines.push(`Mutation Classes: ${(summary.mutation_classes ?? []).join(', ')}`);
  }
  if ((summary.authority_loci ?? []).length > 0) {
    lines.push(`Authority Loci: ${(summary.authority_loci ?? []).join(', ')}`);
  }
  if (summary.site_id) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
  }
  if (summary.site_id && isSiteAuthorityWorkflowAction(summary.next_action)) {
    lines.push(`Site Action Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:action:workflow:live:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id}${summary.active_operation_id ? ` --operation-id ${summary.active_operation_id}` : ''} --operator-session-file <operator-session-file> --execute-site-action`);
  }
  if (summary.site_id && summary.active_operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --operation-id ${summary.active_operation_id} --operator-session-file <operator-session-file>`);
    if (summary.active_operation_next_action) {
      lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --operation-id ${summary.active_operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
      if (summary.active_operation_next_action === 'refresh_site_continuity_loop') {
        lines.push(`Continuity Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --operation-id ${summary.active_operation_id} --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity`);
      }
      if (summary.active_operation_next_action === 'review_site_continuity_reconciliation_execution' && summary.active_operation_focus_ref) {
        lines.push(`Review Ack: pnpm --filter @narada2/cloudflare-carrier product:operation:focus-review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --operation-id ${summary.active_operation_id} --focus-kind ${summary.active_operation_focus_kind ?? 'site_continuity_reconciliation_execution'} --focus-ref ${summary.active_operation_focus_ref} --operator-session-file <operator-session-file>`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

function isSiteAuthorityWorkflowAction(action) {
  return typeof action === 'string'
    && (
      action === 'read_site_authority'
      || action === 'focus_membership_authority'
      || action === 'inspect_inactive_membership'
      || action.startsWith('transfer_')
      || action === 'continue_authority_transfer'
      || action === 'verify_full_cloudflare_authority'
    );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseSiteAuthorityReadArgs(process.argv.slice(2));
    const result = await readSiteAuthority(config);
    if (config.format === 'text') {
      process.stdout.write(formatSiteAuthorityReadText(result));
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
